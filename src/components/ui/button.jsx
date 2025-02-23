/*
v1.1: Renamed file to Button.jsx and updated component to use React.forwardRef.
Optimization notes:
- Improved ref forwarding for easier integration with parent components.
- Added PropTypes for runtime type checking.
*/
//src/components/ui/button.jsx      this is the name file and this comment is allowed to be removed

import * as React from "react";
import PropTypes from "prop-types";

const Button = React.forwardRef(function Button(
  { children, variant = "default", className = "", ...props },
  ref
) {
  let variantClass = "";
  if (variant === "send") {
    variantClass = "send-button";
  } else if (variant === "icon") {
    variantClass = "icon-button";
  }
  return (
    <button ref={ref} className={`${variantClass} ${className}`} {...props}>
      {children}
    </button>
  );
});

Button.propTypes = {
  children: PropTypes.node,
  variant: PropTypes.oneOf(["default", "send", "icon"]),
  className: PropTypes.string,
};

export { Button };

