"use client"
/*
v1.3: Fixed import paths for Avatar, Button, and Input to use @/components/ui.
v1.4: Updated to use FeatherIcon for button images as per user's instructions.
v1.5: Added voice mode integration for Gemini audio chat using native WebSocket and audio processing.
Optimization notes:
- Added voice recording functionality that only displays when voice mode is active.
- Gemini API key is read from the environment using Vite’s import.meta.env.
- Uses native WebSocket and Web Audio APIs—no extra libraries are needed.
*/
// src/pages/ChatInterface.jsx

import React, { useState, useRef } from "react";
import { Avatar } from "@/components/ui/avatar.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { FeatherIcon } from "@/components/ui/FeatherIcon.jsx";

function ChatInterface() {
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [message, setMessage] = useState("");
  const [recording, setRecording] = useState(false);

  // Refs for voice recording
  const wsRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const scriptProcessorRef = useRef(null);

  // Gemini WebSocket URL using the API key from the .env file
  const GEMINI_WS_URL = `wss://gemini.googleapis.com/v1alpha/live?api_key=${import.meta.env.VITE_GEMINI_API_KEY}`;

  // Helper: Convert Float32 samples to 16-bit PCM
  function convertFloat32ToInt16(buffer) {
    const l = buffer.length;
    const result = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      result[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return result;
  }

  // Helper: Downsample Int16Array from sampleRate to outSampleRate using averaging
  function downsampleBuffer(buffer, sampleRate, outSampleRate) {
    if (outSampleRate === sampleRate) {
      return buffer;
    }
    if (outSampleRate > sampleRate) {
      console.error("Downsampling rate should be smaller than original sample rate");
      return buffer;
    }
    const sampleRateRatio = sampleRate / outSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Int16Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0, count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = Math.min(32767, Math.max(-32768, Math.round((accum / count) * 32767)));
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  // Helper: Convert an Int16Array to a Base64 encoded string
  function int16ToBase64(int16Array) {
    let binary = "";
    const bytes = new Uint8Array(int16Array.buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Helper: Encode raw PCM samples into a minimal WAV container for playback
  function encodeWAV(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    function writeString(view, offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }
    let offset = 0;
    writeString(view, offset, "RIFF"); offset += 4;
    view.setUint32(offset, 36 + samples.length * 2, true); offset += 4;
    writeString(view, offset, "WAVE"); offset += 4;
    writeString(view, offset, "fmt "); offset += 4;
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, 1, true); offset += 2;
    view.setUint16(offset, 1, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * 2, true); offset += 4;
    view.setUint16(offset, 2, true); offset += 2;
    view.setUint16(offset, 16, true); offset += 2;
    writeString(view, offset, "data"); offset += 4;
    view.setUint32(offset, samples.length * 2, true); offset += 4;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      view.setInt16(offset, samples[i], true);
    }
    return new Blob([view], { type: "audio/wav" });
  }

  // Start voice recording: establishes WebSocket connection and begins audio capture.
  const startVoiceRecording = async () => {
    setRecording(true);
    const ws = new WebSocket(GEMINI_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connection opened");
      // Send initial setup message with audio configuration.
      const setupMessage = {
        setup: {
          model: "models/gemini-2.0-flash-exp",
          generationConfig: {
            responseModalities: ["AUDIO"],
            maxOutputTokens: 1000,
            temperature: 0.5,
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: "Kore" // Choose desired voice
                }
              }
            }
          },
          systemInstruction: "Respond using audio only."
        }
      };
      ws.send(JSON.stringify(setupMessage));
    };

    ws.onmessage = async (event) => {
      if (typeof event.data === "string") {
        const message = JSON.parse(event.data);
        console.log("Received JSON message:", message);
      } else if (event.data instanceof Blob) {
        console.log("Received audio Blob");
        // Assume the Blob contains raw PCM Int16 data at 24kHz. Convert to WAV and play.
        const arrayBuffer = await event.data.arrayBuffer();
        const samples = new Int16Array(arrayBuffer);
        const wavBlob = encodeWAV(samples, 24000);
        const url = URL.createObjectURL(wavBlob);
        const audio = new Audio(url);
        audio.play();
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    // Request microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    // Create a ScriptProcessorNode to process audio chunks
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    scriptProcessorRef.current = processor;

    source.connect(processor);
    processor.connect(audioContext.destination);

    processor.onaudioprocess = (e) => {
      if (!recording) return;
      const inputData = e.inputBuffer.getChannelData(0);
      // Convert float samples to 16-bit PCM
      const int16Data = convertFloat32ToInt16(inputData);
      // Downsample to 16kHz as required by the API
      const downsampledData = downsampleBuffer(int16Data, audioContext.sampleRate, 16000);
      // Convert binary data to a base64 string for JSON transport
      const base64Data = int16ToBase64(downsampledData);
      const message = {
        realtimeInput: {
          media_chunks: [base64Data]
        }
      };
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(message));
      }
    };
  };

  // Stop voice recording and clean up audio resources.
  const stopVoiceRecording = () => {
    setRecording(false);
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (wsRef.current) {
      wsRef.current.close();
    }
    console.log("Voice recording stopped and WebSocket connection closed");
  };

  // Original dummy data for conversations and messages
  const conversations = [
    { id: 1, title: "How to learn React", date: "Today" },
    { id: 2, title: "Building a portfolio", date: "Today" },
    { id: 3, title: "JavaScript best practices", date: "Yesterday" },
    { id: 4, title: "CSS Grid vs Flexbox", date: "Yesterday" },
  ];

  const messages = [
    {
      id: 1,
      content: "Hello! How can I help you today?",
      sender: "ai",
    },
    {
      id: 2,
      content: "I need help with React hooks.",
      sender: "user",
    },
    {
      id: 3,
      content:
        "I'd be happy to help you understand React hooks. What specific aspect would you like to learn about?",
      sender: "ai",
    },
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    // Handle text message submission logic here (e.g., updating messages list)
    setMessage("");
  };

  return (
    <div className="chat-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-content">
          {/* Profile Section */}
          <div className="profile-section">
            <Avatar
              src="https://via.placeholder.com/32"
              alt="User Avatar"
              fallback="U"
            />
            <div className="profile-info">
              <p className="profile-name">John Doe</p>
              <p className="profile-plan">Premium Plan</p>
            </div>
            <Button variant="icon">
              <FeatherIcon name="settings" className="settings-icon" />
              <span className="sr-only">Settings</span>
            </Button>
          </div>
          {/* Conversations List */}
          <div className="conversations-list">
            <div className="conversations-group">
              {conversations.map((conversation, index) => (
                <React.Fragment key={conversation.id}>
                  {(index === 0 ||
                    conversations[index - 1].date !== conversation.date) && (
                    <div className="date-divider">{conversation.date}</div>
                  )}
                  <button className="conversation-item">
                    {conversation.title}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Main Chat Area */}
      <div className="chat-main">
        <div className="messages-container">
          <div className="messages-list">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`message-wrapper ${
                  msg.sender === "user" ? "user-message" : "ai-message"
                }`}
              >
                <div className="message-bubble">{msg.content}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Chat Input */}
        <div className="chat-input-container">
          {/* Conditional Voice Recording Panel */}
          {isVoiceMode && (
            <div className="voice-recording-panel" style={{ marginBottom: "1rem" }}>
              {recording ? (
                <Button
                  type="button"
                  variant="icon"
                  onClick={stopVoiceRecording}
                >
                  <FeatherIcon name="stop-circle" className="voice-icon" />
                  <span className="sr-only">Stop recording</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="icon"
                  onClick={startVoiceRecording}
                >
                  <FeatherIcon name="mic" className="voice-icon" />
                  <span className="sr-only">Start recording</span>
                </Button>
              )}
            </div>
          )}
          <form className="chat-form" onSubmit={handleSubmit}>
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
            />
            <Button
              type="button"
              variant="icon"
              onClick={() => setIsVoiceMode(!isVoiceMode)}
              className={isVoiceMode ? "voice-button active" : "voice-button"}
            >
              <FeatherIcon name="mic" className="voice-icon" />
              <span className="sr-only">Toggle voice mode</span>
            </Button>
            <Button type="submit" variant="send">
              <FeatherIcon name="arrow-up-circle" className="send-icon" />
              <span className="sr-only">Send message</span>
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ChatInterface;






