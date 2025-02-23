// v1.0: Updated to use new CSS classes for avatar styling
//src/components/ui/avatar.jsx      this is the name file and this comment is allowed to be removed
import * as React from "react";

export function Avatar({ src, fallback, alt }) {
  return (
    <div className="avatar">
      {src ? (
        <img src={src} alt={alt} className="avatar-image" />
      ) : (
        <div className="avatar-image" style={{display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f3f4f6", color: "#6b7280"}}>
          {fallback}
        </div>
      )}
    </div>
  );
}

