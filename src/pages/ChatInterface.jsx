"use client"
/*
v1.10:
- Modified file upload flow so that when a document is selected, a file preview (with a file-text icon and file name) appears in the chat input area.
- The attached file is not immediately sent to the Gemini API; instead, when the user submits the message, both the file and the text prompt (if any) are sent together.
- The API call is made with extended token limits for both input and output.
- Gemini API responses are now rendered as rich text (using dangerouslySetInnerHTML) so that bullet points, bold text, and other formatting are shown.
*/

import React, { useState, useEffect, useRef } from "react";
import { Avatar } from "@/components/ui/avatar.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { FeatherIcon } from "@/components/ui/FeatherIcon.jsx";
import { GoogleGenerativeAI } from "@google/generative-ai";

function ChatInterface() {
  // Conversation state: each conversation has id, title, date, messages (array of {id, content, sender, [type]})
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [chatSession, setChatSession] = useState(null); // Gemini chat session for active conversation
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [recording, setRecording] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [message, setMessage] = useState("");
  // New state for file attachment
  const [attachedFile, setAttachedFile] = useState(null);

  // Ref for file input for document upload
  const fileInputRef = useRef(null);

  // Refs for voice recording (unchanged)
  const wsRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const workletNodeRef = useRef(null);

  // Gemini WebSocket URL for voice mode (unchanged)
  const GEMINI_WS_URL = `wss://gemini.googleapis.com/v1alpha/live?api_key=${import.meta.env.VITE_GEMINI_API_KEY}`;

  // Load conversations from local storage on mount
  useEffect(() => {
    const stored = localStorage.getItem("conversations");
    if (stored) {
      const convs = JSON.parse(stored);
      setConversations(convs);
      if (convs.length > 0) {
        setCurrentConversationId(convs[0].id);
      }
    } else {
      const initialConversation = { id: Date.now(), title: "Chat", date: new Date().toLocaleDateString(), messages: [] };
      setConversations([initialConversation]);
      setCurrentConversationId(initialConversation.id);
    }
  }, []);

  // Helper to update conversations in state and local storage
  const updateConversations = (updatedConversations) => {
    setConversations(updatedConversations);
    localStorage.setItem("conversations", JSON.stringify(updatedConversations));
  };

  // Get current conversation messages
  const currentConversation = conversations.find((conv) => conv.id === currentConversationId) || { messages: [] };

  // Helper to convert ArrayBuffer to Base64 string
  function arrayBufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  // Handle file picker click to trigger hidden file input
  const handleFilePickerClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Handle document file upload – now simply reads and stores the file (showing a preview) without calling the API immediately
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64Data = arrayBufferToBase64(arrayBuffer);
      setAttachedFile({
        fileName: file.name,
        base64: base64Data,
        mimeType: file.type || "application/pdf",
      });
    } catch (error) {
      console.error("Error reading file:", error);
    }
  };

  // Gemini Text / Document Integration: Handle message submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    // If there's no text and no attached file, do nothing
    if (!message.trim() && !attachedFile) return;

    setIsThinking(true);
    let updatedConversations = [...conversations];

    // If a file is attached, add a file message bubble
    if (attachedFile) {
      const fileMessage = { id: Date.now() + "_file", content: attachedFile.fileName, sender: "user", type: "file" };
      updatedConversations = updatedConversations.map((conv) => {
        if (conv.id === currentConversationId) {
          return { ...conv, messages: [...conv.messages, fileMessage] };
        }
        return conv;
      });
    }

    // If text is provided, add a text message bubble
    if (message.trim()) {
      const userTextMessage = { id: Date.now() + "_text", content: message, sender: "user" };
      updatedConversations = updatedConversations.map((conv) => {
        if (conv.id === currentConversationId) {
          return { ...conv, messages: [...conv.messages, userTextMessage] };
        }
        return conv;
      });
    }
    updateConversations(updatedConversations);

    try {
      const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      let result;
      // If a file is attached, use generateContent to send both the file and the text prompt together
      if (attachedFile) {
        result = await model.generateContent([
          {
            inlineData: {
              data: attachedFile.base64,
              mimeType: attachedFile.mimeType,
            },
          },
          message.trim() ? message : ""
        ], { maxInputTokens: 4096, maxOutputTokens: 4096 });
      } else {
        // Text-only flow: use the chat session (extending output tokens)
        if (!chatSession) {
          const newChat = model.startChat({
            history: [{ role: "user", parts: [{ text: message }] }],
            maxOutputTokens: 4096,
          });
          setChatSession(newChat);
          result = await newChat.sendMessage("", { maxOutputTokens: 4096 });
        } else {
          result = await chatSession.sendMessage(message, { maxOutputTokens: 4096 });
        }
      }
      // Assume the response is rich HTML content; render it as such
      const aiText = result.response.text();
      const aiMessage = { id: Date.now() + "_ai", content: aiText, sender: "ai" };
      const convsAfterAI = updatedConversations.map((conv) => {
        if (conv.id === currentConversationId) {
          return { ...conv, messages: [...conv.messages, aiMessage] };
        }
        return conv;
      });
      updateConversations(convsAfterAI);
    } catch (error) {
      console.error("Error during Gemini generation:", error);
      const errorMessage = { id: Date.now() + "_error", content: "Error: Unable to get response from Gemini.", sender: "ai" };
      const convsAfterError = updatedConversations.map((conv) => {
        if (conv.id === currentConversationId) {
          return { ...conv, messages: [...conv.messages, errorMessage] };
        }
        return conv;
      });
      updateConversations(convsAfterError);
    } finally {
      setIsThinking(false);
      setMessage("");
      setAttachedFile(null);
    }
  };

  // New conversation: resets chat session and creates a new conversation
  const handleNewConversation = () => {
    const newConv = { id: Date.now(), title: "Chat " + new Date().toLocaleTimeString(), date: new Date().toLocaleDateString(), messages: [] };
    const updatedConvs = [newConv, ...conversations];
    updateConversations(updatedConvs);
    setCurrentConversationId(newConv.id);
    setChatSession(null);
  };

  // Handle selecting an existing conversation
  const handleSelectConversation = (id) => {
    setCurrentConversationId(id);
    setChatSession(null); // Reset chat session for selected conversation
  };

  // Voice recording helper functions (unchanged)
  function convertFloat32ToInt16(buffer) {
    const l = buffer.length;
    const result = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      result[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return result;
  }

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

  function int16ToBase64(int16Array) {
    let binary = "";
    const bytes = new Uint8Array(int16Array.buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

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

  const startVoiceRecording = async () => {
    setRecording(true);
    setIsThinking(false);
    try {
      const ws = new WebSocket(GEMINI_WS_URL);
      wsRef.current = ws;
  
      ws.onopen = () => {
        console.log("WebSocket connection opened");
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
                    voiceName: "Kore"
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
          const messageData = JSON.parse(event.data);
          console.log("Received JSON message:", messageData);
          if (messageData.response && messageData.response.text) {
            const aiVoiceMessage = { id: Date.now(), content: messageData.response.text, sender: "ai" };
            const updatedConvs = conversations.map((conv) => {
              if (conv.id === currentConversationId) {
                return { ...conv, messages: [...conv.messages, aiVoiceMessage] };
              }
              return conv;
            });
            updateConversations(updatedConvs);
            setIsThinking(false);
          }
        } else if (event.data instanceof Blob) {
          console.log("Received audio Blob");
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
    } catch (err) {
      console.error("Failed to establish WebSocket connection:", err);
    }
  
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
  
    const processorCode = 
      class PCMProcessor extends AudioWorkletProcessor {
        process(inputs, outputs, parameters) {
          const input = inputs[0];
          if (input && input[0]) {
            this.port.postMessage(input[0]);
          }
          return true;
        }
      }
      registerProcessor('pcm-processor', PCMProcessor);
    ;
    const blob = new Blob([processorCode], { type: "application/javascript" });
    const blobURL = URL.createObjectURL(blob);
    try {
      await audioContext.audioWorklet.addModule(blobURL);
    } catch (error) {
      console.error("Failed to load AudioWorklet module:", error);
      return;
    }
    const workletNode = new AudioWorkletNode(audioContext, "pcm-processor");
    workletNodeRef.current = workletNode;
  
    workletNode.port.onmessage = (event) => {
      if (!recording) return;
      const floatSamples = event.data;
      const int16Data = convertFloat32ToInt16(floatSamples);
      const downsampledData = downsampleBuffer(int16Data, audioContext.sampleRate, 16000);
      const base64Data = int16ToBase64(downsampledData);
      const messageToSend = {
        realtimeInput: {
          media_chunks: [base64Data]
        }
      };
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(messageToSend));
      }
    };
  
    source.connect(workletNode);
  };
  
  const stopVoiceRecording = () => {
    setRecording(false);
    setIsThinking(true);
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
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

  return (
    <div className="chat-container">
      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.9); opacity: 0.7; }
          50% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(0.9); opacity: 0.7; }
        }
      `}</style>
      <div className="sidebar">
        <div className="sidebar-content">
          <div className="profile-section">
            <Avatar
              src="https://placehold.co/32"
              alt="User Avatar"
              fallback="U"
            />
            <div className="profile-info">
              <p className="profile-name">John Doe</p>
              <p className="profile-plan">Premium Plan</p>
            </div>
            <div className="sidebar-buttons">
              <Button variant="icon">
                <FeatherIcon name="settings" className="settings-icon" />
                <span className="sr-only">Settings</span>
              </Button>
              <Button variant="icon" onClick={handleNewConversation}>
                <FeatherIcon name="edit" className="edit-icon" />
                <span className="sr-only">New Conversation</span>
              </Button>
            </div>
          </div>
          <div className="conversations-list">
            <div className="conversations-group">
              {conversations.map((conv, index) => (
                <React.Fragment key={conv.id}>
                  {(index === 0 ||
                    conversations[index - 1].date !== conv.date) && (
                    <div className="date-divider">{conv.date}</div>
                  )}
                  <button className="conversation-item" onClick={() => handleSelectConversation(conv.id)}>
                    {conv.title}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="chat-main">
        <div className="messages-container">
          <div className="messages-list">
            {currentConversation.messages.length === 0 ? (
              <p className="no-messages">No messages yet. Start chatting!</p>
            ) : (
              currentConversation.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`message-wrapper ${
                    msg.type === "file"
                      ? "file-message"
                      : msg.sender === "user"
                      ? "user-message"
                      : "ai-message"
                  }`}
                >
                  {msg.type === "file" ? (
                    <div className="message-bubble file-bubble">
                      <FeatherIcon name="file-text" className="file-icon" />
                      <span style={{ marginLeft: "0.5rem" }}>{msg.content}</span>
                    </div>
                  ) : msg.sender === "ai" ? (
                    <div className="message-bubble rich-text" dangerouslySetInnerHTML={{ __html: msg.content }} />
                  ) : (
                    <div className="message-bubble">{msg.content}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
        <div className="chat-input-container">
          <form className="chat-form" onSubmit={handleSubmit}>
            {/* File attachment preview */}
            {attachedFile && (
              <div className="attached-file-preview" style={{ backgroundColor: "#f0f0f0", padding: "0.5rem", marginBottom: "0.5rem", borderRadius: "4px", display: "flex", alignItems: "center" }}>
                <FeatherIcon name="file-text" className="file-icon" />
                <span style={{ marginLeft: "0.5rem" }}>{attachedFile.fileName}</span>
              </div>
            )}
            <Button
              type="button"
              variant="icon"
              onClick={handleFilePickerClick}
            >
              <FeatherIcon name="plus-circle" className="upload-icon" />
              <span className="sr-only">Upload document</span>
            </Button>
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
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleFileUpload}
              accept=".pdf,.txt,.doc,.docx"
            />
          </form>
        </div>
      </div>
    </div>
  );
}

export default ChatInterface;











