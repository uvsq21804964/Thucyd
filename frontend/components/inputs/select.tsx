/* eslint-disable react/void-dom-elements-no-children */

'use client';

import clsx from 'clsx';
import { FieldErrors, FieldValues, UseFormRegister } from 'react-hook-form';

interface SelectProps {
  label: string;
  id: string;
  required?: boolean;
  register: UseFormRegister<FieldValues>;
  errors: FieldErrors;
  disabled?: boolean;
  children?: React.ReactNode;
}

const Select: React.FC<SelectProps> = ({
  label,
  id,
  required,
  register,
  errors,
  disabled,
  children,
  ...props
}) => {
  return (
    <div>
      <label
        className="
          block 
          text-sm
          font-medium
          leading-6
          text-text2
        "
        htmlFor={id}
      >
        {label}
      </label>
      <div className="mt-2">
        <select
          id={id}
          autoComplete={id}
          disabled={disabled}
          {...props}
          {...register(id, { required })}
          className={clsx(
            `
          form-input
          block
          w-full
          rounded-xl
          border-0
          py-1.5
          bg-text1
          text-text2
          shadow-sm
          ring-1
          ring-inset
          ring-gray-300
          placeholder:text-gray-400
          focus:ring-2
          focus:ring-inset
          focus:ring-sky-600
          sm:text-sm
          sm:leading-6`,
            errors[id] && 'focus:ring-rose-500',
            disabled && 'opacity-50 cursor-default'
          )}
        >
          {children}
        </select>
      </div>
    </div>
  );
};

export default Select;
