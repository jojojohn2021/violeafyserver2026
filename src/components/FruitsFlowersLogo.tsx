import React from 'react';

interface FruitsFlowersLogoProps {
  className?: string;
  size?: number | string;
}

export default function FruitsFlowersLogo({ className = '', size = '100%' }: FruitsFlowersLogoProps) {
  return (
    <div 
      className={`relative flex items-center justify-center select-none ${className}`} 
      style={{ width: size, height: size }}
      id="fruits-flowers-brand-logo-container"
    >
      <svg 
        viewBox="0 0 200 100" 
        className="w-full h-full overflow-visible"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Circular gradient outline matching the uploaded brand picture */}
          <linearGradient id="logoBorderGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f59e0b" /> {/* warm golden orange */}
            <stop offset="40%" stopColor="#ef4444" /> {/* crimson red */}
            <stop offset="100%" stopColor="#a21caf" /> {/* fuchsia berry */}
          </linearGradient>
          
          <filter id="logoSubtleShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="1" dy="2" stdDeviation="2" floodOpacity="0.1" />
          </filter>
        </defs>

        {/* Circular frame background slice */}
        <circle 
          cx="100" 
          cy="50" 
          r="46" 
          fill="#fdfbf7" 
          stroke="url(#logoBorderGrad)" 
          strokeWidth="3.5" 
          filter="url(#logoSubtleShadow)"
        />

        {/* Cursive design for "Fruits" */}
        <g transform="translate(100, 42)" textAnchor="middle">
          {/* Fruits text */}
          <text 
            x="-12" 
            y="0" 
            fill="#15803d" 
            fontWeight="900" 
            fontSize="26px" 
            fontFamily="Georgia, ui-serif, Cambria, serif"
            fontStyle="italic"
            letterSpacing="-0.5px"
          >
            Fruits
          </text>
          
          {/* Cozy curly ornament for "Fruits" */}
          <path 
            d="M -54,-15 C -46,-24 -36,-14 -40,-6 C -44,2 -56,-2 -55,-10 Z" 
            fill="#16a34a" 
            opacity="0.85"
          />
        </g>

        {/* The clever connector leaf "n" wrapping the text */}
        <g transform="translate(142, 41)">
          {/* Leaf 1 */}
          <path 
            d="M -3,-10 C 5,-14 10,-5 3,-2 C -4,1 -4,-6 -3,-10" 
            fill="#16a34a" 
          />
          {/* Leaf 2 */}
          <path 
            d="M 2,-4 C 8,2 -2,8 -3,2 C -4,-4 0,-7 2,-4" 
            fill="#22c55e" 
          />
          <text 
            x="0" 
            y="0" 
            fill="#16a34a" 
            fontWeight="bold" 
            fontSize="18px" 
            fontFamily="Georgia, ui-serif, Cambria, serif"
            fontStyle="italic"
            textAnchor="middle"
          >
            n
          </text>
        </g>

        {/* Elegant typography for "Flowers" */}
        <g transform="translate(100, 71)" textAnchor="middle">
          <text 
            x="2" 
            y="0" 
            fill="#be185d" 
            fontWeight="900" 
            fontSize="28px" 
            fontFamily="Georgia, ui-serif, Cambria, serif" 
            fontStyle="italic"
            letterSpacing="-0.5px"
          >
            Flowers
          </text>
          
          {/* Ornamental curve underflowers */}
          <path 
            d="M -45,-1 C -30,6 30,6 45,-1" 
            stroke="#db2777" 
            strokeWidth="2" 
            fill="none" 
            strokeLinecap="round" 
            opacity="0.7"
          />
          {/* Flower dots decoration */}
          <circle cx="-45" cy="-1" r="2.5" fill="#f43f5e" />
          <circle cx="45" cy="-1" r="2.5" fill="#f43f5e" />
          <circle cx="0" cy="4" r="2" fill="#e11d48" />
        </g>
      </svg>
    </div>
  );
}
