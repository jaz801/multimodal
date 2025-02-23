/*
v1.1: Renamed file to Input.jsx and updated component to use React.forwardRef.
Optimization notes:
- Enabled ref forwarding to allow parent components to access the underlying input element.
- Added PropTypes for enhanced type checking and maintainability.
*/
//src/components/ui/input.jsx      this is the name file and this comment is allowed to be removed

import * as React from "react";
import PropTypes from "prop-types";

const Input = React.forwardRef(function Input({ className = "", ...props }, ref) {
  return (
    <input ref={ref} className={`message-input ${className}`} {...props} />
  );
});

Input.propTypes = {
  className: PropTypes.string,
};

export { Input };



