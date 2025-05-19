import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { memo } from 'react';

function Button({
  content,
  bg = 'blue-600',     
  text = 'white',      
  icon,
  className = '',      
  onClick,
  type = 'button',
  disabled = false,
}) {
  let hoverBgClass = '';
  
  if (bg.includes('-') && !bg.startsWith('transparent') && !bg.includes('gradient')) {
    const [colorName, shadeStr] = bg.split('-');
    const shade = parseInt(shadeStr, 10);
    if (!isNaN(shade)) {
        const hoverShade = Math.min(900, shade + 100); // Darken by 100, max 900
        hoverBgClass = `hover:bg-${colorName}-${hoverShade}`;
    } else {
       
        hoverBgClass = `hover:brightness-90`; 
    }
  } else if (bg !== 'transparent' && bg !== 'white' && bg !== 'black' && !bg.includes('gradient')) {
    // For base colors without shade (e.g., 'red') or custom named colors
    hoverBgClass = `hover:brightness-90`;
  }
  // For gradient or fully custom hover, pass via `className` prop

  // Determine focus ring color based on background
  const focusRingColor = bg.split('-')[0] || 'blue'; // Default to blue if parsing fails

  const buttonClasses = `
    bg-${bg}
    text-${text}
    ${hoverBgClass}
    py-2 px-4 inline-flex items-center justify-center gap-2
    font-medium rounded-lg shadow-sm
    transition-all duration-150 ease-in-out
    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-${focusRingColor}-500
    disabled:opacity-50 disabled:cursor-not-allowed
    ${className}
  `;

  return (
    <button
      type={type}
      onClick={onClick}
      className={buttonClasses.trim().replace(/\s\s+/g, ' ')} // Clean up extra spaces
      disabled={disabled}
    >
      {content}
      {icon && (
        // Icon inherits text color from button's text-${text} class
        <span className="ml-1.5">
          <FontAwesomeIcon icon={icon} />
        </span>
      )}
    </button>
  );
}

export default memo(Button);