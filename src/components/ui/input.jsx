/*************************************
 * FILE: src/components/ui/input.jsx
 *************************************/
/*
v1.2: Added multiline support and scroll behavior.
      - Switched from <input> to <textarea> so users can press Shift+Enter for new lines.
      - Enabled text overflow scrolling for longer inputs.

OPTIMIZATION NOTES:
1) Converting to <textarea> allows natural multi-line input without extra JS handling.
2) Default scrolling and Shift+Enter behavior rely on native <textarea> functionality.
*/

/*
v1.1: Renamed file to Input.jsx and updated component to use React.forwardRef.
Optimization notes:
- Enabled ref forwarding to allow parent components to access the underlying input element.
- Added PropTypes for enhanced type checking and maintainability.
*/

import * as React from "react";
import PropTypes from "prop-types";

const Input = React.forwardRef(function Input({ className = "", ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={`message-input ${className}`}
      {...props}
      rows={3}
      style={{
        resize: "vertical",
        overflowY: "auto"
      }}
    />
  );
});

Input.propTypes = {
  className: PropTypes.string
};

export { Input };




