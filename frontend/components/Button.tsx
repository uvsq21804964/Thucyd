'use client';

import clsx from 'clsx';

interface ButtonProps {
  type?: 'button' | 'submit';
  fullWidth?: boolean;
  children?: React.ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  border?: boolean;
  shadow?: boolean;
  blanc?: boolean;
  violetFonce?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  type,
  fullWidth,
  children,
  onClick,
  secondary,
  danger,
  disabled,
  border,
  shadow,
  blanc,
  violetFonce,
}) => {
  return (
    <button
      onClick={onClick}
      type={type === 'submit' ? 'submit' : 'button'}
      disabled={disabled}
      className={clsx(
        `
      flex
      justify-center
      rounded-full
      px-3
      py-2
      text-sm
      font-semibold
      focus-visible:outline
      focus-visible:outline-2
      focus-visible:outline-offset-2
      `,
        disabled &&
          'border-white opacity-50 cursor-default bg-white text-black',
        fullWidth && 'w-full',
        !secondary &&
          !danger &&
          !disabled &&
          'bg-background hover:bg-button focus-visible:outline-button',
        border && 'border-2 border-button',
        shadow && 'shadow-sm shadow-slate-900',
        blanc &&
          'bg-white hover:bg-button focus-visible:outline-button hover:text-white focus-visible:text-white',
        violetFonce && disabled && 'text-black',
        violetFonce && !disabled && 'text-white',
        violetFonce &&
          'bg-button hover:bg-white focus-visible:bg-background  hover:text-black focus-visible:text-black'
      )}
    >
      {children}
    </button>
  );
};

export default Button;
