/*
v1.0: User added FeatherIcon component to render feather icons using the feather-icons npm package.
Optimization notes:
- This component abstracts SVG generation using feather.icons, simplifying icon usage across the app.
*/
//components/ui/FeatherIcon.jsx this is the name of the file, this should never be removed 

import React from 'react';
import feather from 'feather-icons';

const FeatherIcon = ({ name, className = '', ...attrs }) => {
  const svgMarkup = feather.icons[name].toSvg({ class: className, ...attrs });
  return <span dangerouslySetInnerHTML={{ __html: svgMarkup }} />;
};

export { FeatherIcon };
