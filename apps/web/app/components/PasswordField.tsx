'use client';

import React from 'react';
import { useId, useState } from 'react';

type PasswordFieldProps = {
  autoComplete: 'current-password' | 'new-password';
  describedBy?: string;
  minLength?: number;
};

export default function PasswordField({
  autoComplete,
  describedBy,
  minLength = 8,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const inputId = useId();

  return (
    <label className="passwordFieldLabel" htmlFor={inputId}>
      Password
      <span className="passwordField">
        <input
          id={inputId}
          name="password"
          type={visible ? 'text' : 'password'}
          minLength={minLength}
          required
          autoComplete={autoComplete}
          aria-describedby={describedBy}
          placeholder="Password"
        />
        <button
          className="passwordToggle"
          type="button"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </span>
    </label>
  );
}
