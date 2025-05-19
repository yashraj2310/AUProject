import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';

function Loader({
  size = "3x",
  message = "Loading...",
  showText = true, // Control visibility of the message
  textColor = "text-gray-300",
  spinnerColor = "text-blue-500",
  className = "", // For additional styling of the container
  containerHeight = null, // e.g., "h-screen", "h-64"
}) {

  const containerClasses = `
    flex flex-col justify-center items-center
    ${containerHeight || ''}
    ${className}
  `;

  return (
    <div className={containerClasses.trim().replace(/\s\s+/g, ' ')}>
      <FontAwesomeIcon icon={faSpinner} spin size={size} className={`${spinnerColor} mb-3`} />
      {showText && message && <p className={`text-lg ${textColor}`}>{message}</p>}
    </div>
  );
}

export default Loader;