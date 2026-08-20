/**
 * Authentic Fluent UI System Icons (regular, 24px, MIT licensed) — sourced from
 * @fluentui/svg-icons so the app matches the real Outlook/M365 icon language
 * instead of generic Material-style glyphs.
 *
 * All icons share a viewBox of "0 0 24 24" and render at `size` (default 20)
 * with fill: currentColor, so they inherit color and can be sized via props.
 * Extra SVG props (onClick, style, etc.) pass through.
 */

import type { SVGProps } from 'react';

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'viewBox'> {
  size?: number;
}


export function MailIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M5.25 4h13.5a3.25 3.25 0 0 1 3.24 3.07l.01.18v9.5a3.25 3.25 0 0 1-3.07 3.24l-.18.01H5.25a3.25 3.25 0 0 1-3.24-3.07L2 16.75v-9.5a3.25 3.25 0 0 1 3.07-3.24zh13.5zM20.5 9.37l-8.15 4.3q-.3.14-.6.04l-.1-.05L3.5 9.37v7.38c0 .92.7 1.67 1.6 1.74l.15.01h13.5c.92 0 1.67-.7 1.74-1.6l.01-.15zM18.75 5.5H5.25c-.92 0-1.67.7-1.74 1.6l-.01.15v.43l8.5 4.47 8.5-4.47v-.43c0-.92-.7-1.67-1.6-1.74z" />
    </svg>
  );
}

export function CalendarIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M17.75 3C19.55 3 21 4.46 21 6.25v11.5c0 1.8-1.46 3.25-3.25 3.25H6.25A3.25 3.25 0 0 1 3 17.75V6.25C3 4.45 4.46 3 6.25 3zm1.75 5.5h-15v9.25c0 .97.78 1.75 1.75 1.75h11.5c.97 0 1.75-.78 1.75-1.75zm-11.75 6a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5m4.25 0a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5m-4.25-4a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5m4.25 0a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5m4.25 0a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5m1.5-6H6.25c-.97 0-1.75.78-1.75 1.75V7h15v-.75c0-.97-.78-1.75-1.75-1.75" />
    </svg>
  );
}

export function PeopleIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M5.5 8a2.5 2.5 0 1 1 5 0 2.5 2.5 0 0 1-5 0M8 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8m7.5 5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0M17 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6m-2.75 13.04q1.04.44 2.75.46c2.28 0 3.59-.7 4.3-1.56a3 3 0 0 0 .7-1.73v-.03c0-1.2-.97-2.18-2.18-2.18H14.1q.6.63.81 1.5h4.91a.7.7 0 0 1 .68.7l-.04.18q-.05.25-.32.6C19.8 17.42 18.97 18 17 18c-.98 0-1.67-.15-2.17-.34q-.14.62-.58 1.38M4.25 14C3.01 14 2 15 2 16.25v.28l.01.2q.02.21.1.53c.09.42.29.98.68 1.55C3.61 19.97 5.17 21 8 21s4.39-1.03 5.2-2.2a4.5 4.5 0 0 0 .8-2.27v-.28c0-1.24-1-2.25-2.25-2.25zm-.75 2.5v-.25c0-.41.34-.75.75-.75h7.5c.41 0 .75.34.75.75v.34l-.06.33c-.07.28-.2.65-.46 1.02-.5.71-1.56 1.56-3.98 1.56s-3.49-.85-3.98-1.56a3 3 0 0 1-.52-1.43" />
    </svg>
  );
}

export function CheckmarkCircleIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20m0 1.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17m-1.25 9.94 4.47-4.47a.75.75 0 0 1 1.13.98l-.07.08-5 5a.75.75 0 0 1-.98.07l-.08-.07-2.5-2.5a.75.75 0 0 1 .98-1.13l.08.07zl4.47-4.47z" />
    </svg>
  );
}

export function CloudIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M12 5.5a4.5 4.5 0 0 0-4.5 4.29.75.75 0 0 1-.74.71H6.5a3 3 0 1 0 0 6h11a3 3 0 1 0 0-6h-.26a.75.75 0 0 1-.74-.71A4.5 4.5 0 0 0 12 5.5M6.08 9.02a6 6 0 0 1 11.84 0A4.5 4.5 0 0 1 17.5 18h-11a4.5 4.5 0 0 1-.42-8.98" />
    </svg>
  );
}

export function SettingsIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M12.01 2.25q1.11.01 2.18.25c.32.07.55.33.59.65l.17 1.53a1.38 1.38 0 0 0 1.92 1.11l1.4-.61c.3-.13.64-.06.85.17a10 10 0 0 1 2.2 3.8c.1.3 0 .63-.26.82l-1.25.92a1.38 1.38 0 0 0 0 2.22l1.25.92c.26.19.36.52.27.82a10 10 0 0 1-2.2 3.8.75.75 0 0 1-.85.17l-1.4-.62a1.38 1.38 0 0 0-1.93 1.12l-.17 1.52a.75.75 0 0 1-.58.65 9.5 9.5 0 0 1-4.4 0 .75.75 0 0 1-.57-.65l-.17-1.52a1.38 1.38 0 0 0-1.93-1.11l-1.4.62a.75.75 0 0 1-.85-.18 10 10 0 0 1-2.2-3.8c-.1-.3 0-.63.26-.82l1.25-.92a1.38 1.38 0 0 0 0-2.22l-1.24-.92a.75.75 0 0 1-.28-.82 10 10 0 0 1 2.2-3.8c.23-.23.57-.3.86-.17l1.4.62c.4.17.86.15 1.25-.08.38-.22.63-.6.68-1.04l.17-1.53a.75.75 0 0 1 .58-.65q1.08-.24 2.2-.25m0 1.5q-.67 0-1.35.12l-.11.97a2.9 2.9 0 0 1-4.03 2.33l-.9-.4A8 8 0 0 0 4.29 9.1l.8.59a2.88 2.88 0 0 1 0 4.64l-.8.59a8 8 0 0 0 1.35 2.32l.9-.4a2.88 2.88 0 0 1 4.02 2.32l.1.99q1.35.22 2.7 0l.1-.99a2.88 2.88 0 0 1 4.02-2.32l.9.4a8 8 0 0 0 1.35-2.32l-.8-.59a2.88 2.88 0 0 1 0-4.64l.8-.59a8 8 0 0 0-1.35-2.32l-.9.4q-.55.24-1.15.24c-1.47 0-2.7-1.1-2.86-2.57l-.11-.97q-.68-.11-1.34-.12M12 8.25a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5m0 1.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5" />
    </svg>
  );
}

export function WeatherSunnyIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M12 6.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8m0-6.5c.41 0 .75.34.75.75V4a.75.75 0 0 1-1.5 0V2.25c0-.41.34-.75.75-.75m0 18.5c.41 0 .75.34.75.75V22a.75.75 0 0 1-1.5 0v-1.25c0-.41.34-.75.75-.75M22.5 12a.75.75 0 0 1-.75.75H20a.75.75 0 0 1 0-1.5h1.75c.41 0 .75.34.75.75M4 12a.75.75 0 0 1-.75.75H2a.75.75 0 0 1 0-1.5h1.25c.41 0 .75.34.75.75m15.13-7.63c.3.3.3.77 0 1.06l-.88.89a.75.75 0 1 1-1.06-1.06l.88-.89c.3-.29.77-.29 1.06 0M6.8 17.32c.3.3.3.77 0 1.06l-.88.89a.75.75 0 1 1-1.06-1.06l.88-.89c.3-.29.77-.29 1.06 0m12.33 1.95a.75.75 0 0 1-1.06 0l-.88-.89a.75.75 0 1 1 1.06-1.06l.88.89c.3.3.3.76 0 1.06M6.8 6.68a.75.75 0 0 1-1.06 0l-.88-.89a.75.75 0 1 1 1.06-1.06l.88.89c.3.3.3.76 0 1.06" />
    </svg>
  );
}

export function WeatherMoonIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M9.34 2.55a.75.75 0 0 1 .24 1.06A8.5 8.5 0 0 0 8.25 8a8.75 8.75 0 0 0 12.02 8.11.75.75 0 0 1 .96 1A10.25 10.25 0 1 1 8.29 2.32a.75.75 0 0 1 1.05.23m-1.7 2.02a8.75 8.75 0 0 0 10.79 12.8A9.25 9.25 0 1 1 7.65 4.57" />
    </svg>
  );
}

export function SearchIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M16.1 17.16a8 8 0 1 1 1.06-1.06l4.62 4.62a.75.75 0 1 1-1.06 1.06zM17.5 11a6.5 6.5 0 1 0-13 0 6.5 6.5 0 0 0 13 0" />
    </svg>
  );
}

export function MailAddIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M23 6.5a5.5 5.5 0 1 0-11 0 5.5 5.5 0 0 0 11 0M18 7v2.5a.5.5 0 1 1-1 0V7h-2.5a.5.5 0 0 1 0-1H17V3.5a.5.5 0 0 1 1 0V6h2.5a.5.5 0 0 1 0 1zm2.5 9.75v-4.48a7 7 0 0 0 1.5-1.08v5.56a3.25 3.25 0 0 1-3.07 3.24l-.18.01H5.25a3.25 3.25 0 0 1-3.24-3.07L2 16.75v-9.5a3.25 3.25 0 0 1 3.07-3.24L5.25 4h6.25q-.3.71-.42 1.5H5.25c-.92 0-1.67.7-1.74 1.6l-.01.15v.43l8.5 4.47 1.3-.68q.66.55 1.46.93l-2.41 1.26q-.3.15-.6.05l-.1-.05L3.5 9.37v7.38c0 .92.7 1.67 1.6 1.74l.15.01h13.5c.92 0 1.67-.7 1.74-1.6z" />
    </svg>
  );
}

export function DeleteIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M10 5h4a2 2 0 1 0-4 0M8.5 5a3.5 3.5 0 1 1 7 0h5.75a.75.75 0 0 1 0 1.5h-1.32l-1.17 12.11A3.75 3.75 0 0 1 15.03 22H8.97a3.75 3.75 0 0 1-3.73-3.39L4.07 6.5H2.75a.75.75 0 0 1 0-1.5zm2 4.75a.75.75 0 0 0-1.5 0v7.5a.75.75 0 0 0 1.5 0zM14.25 9c.41 0 .75.34.75.75v7.5a.75.75 0 0 1-1.5 0v-7.5c0-.41.34-.75.75-.75m-7.52 9.47a2.25 2.25 0 0 0 2.24 2.03h6.06c1.15 0 2.12-.88 2.24-2.03L18.42 6.5H5.58z" />
    </svg>
  );
}

export function ReplyIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M9.28 6.28a.75.75 0 0 0-1.06-1.06l-5 5c-.3.3-.3.77 0 1.06l5 5a.75.75 0 0 0 1.06-1.06L5.56 11.5h7.69c3.45 0 6.25 2.8 6.25 6.25v.5a.75.75 0 0 0 1.5 0v-.5A7.75 7.75 0 0 0 13.25 10H5.56z" />
    </svg>
  );
}

export function ReplyAllIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M9.28 5.22c.3.3.3.77 0 1.06l-4.47 4.47 4.47 4.47a.75.75 0 1 1-1.06 1.06l-5-5a.75.75 0 0 1 0-1.06l5-5c.3-.3.77-.3 1.06 0m4 0c.3.3.3.77 0 1.06L9.56 10h3.69A7.75 7.75 0 0 1 21 17.75v.5a.75.75 0 0 1-1.5 0v-.5c0-3.45-2.8-6.25-6.25-6.25H9.56l3.72 3.72a.75.75 0 1 1-1.06 1.06l-5-5a.75.75 0 0 1 0-1.06l5-5c.3-.3.77-.3 1.06 0" />
    </svg>
  );
}

export function FlagIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M3 3.75c0-.42.34-.75.75-.75h16.5c.62 0 .98.7.6 1.2L16.7 9.75l4.16 5.55c.38.5.02 1.2-.6 1.2H4.5v4.75c0 .38-.28.7-.65.74l-.1.01a.75.75 0 0 1-.74-.65l-.01-.1zm15.75.75H4.5V15h14.25l-3.6-4.8a.75.75 0 0 1 0-.9z" />
    </svg>
  );
}

export function AttachIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M11.77 3.74a6 6 0 0 1 8.66 8.3l-.19.2-8.8 8.8-.03.03a3.72 3.72 0 0 1-5.4-5.1l.05-.06.08-.09.14-.15 7.44-7.45c.27-.27.69-.29.98-.07l.08.07c.27.27.3.68.08.98l-.08.08-7.59 7.61a2.23 2.23 0 0 0 3.17 3.1l8.84-8.82A4.5 4.5 0 0 0 13 4.64l-.17.16-.01.02-9.54 9.53a.75.75 0 0 1-1.13-.97l.07-.09z" />
    </svg>
  );
}

export function SendIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M5.7 12 2.3 3.27a.75.75 0 0 1 .94-.98l.1.04 18 9c.51.26.54.97.1 1.28l-.1.06-18 9a.75.75 0 0 1-1.07-.85l.03-.1zL2.3 3.27zM4.4 4.54l2.61 6.7 6.63.01c.38 0 .7.28.74.65v.1c0 .38-.27.7-.64.74l-.1.01H7l-2.6 6.7L19.31 12z" />
    </svg>
  );
}

export function AppsIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="m18.5 2.33 3.17 3.18c.88.88.88 2.3 0 3.18l-2.58 2.59A2.25 2.25 0 0 1 21 13.5v5.25C21 20 20 21 18.75 21H5.25C4.01 21 3 20 3 18.75V5.25C3 4.01 4 3 5.25 3h5.25c1.13 0 2.06.83 2.23 1.92l2.58-2.59c.88-.88 2.3-.88 3.18 0m-14 16.42c0 .41.34.75.75.75h6v-6.75H4.5zm8.25.75h6c.41 0 .75-.34.75-.75V13.5a.75.75 0 0 0-.75-.75h-6zm-2.25-15H5.25a.75.75 0 0 0-.75.75v6h6.75v-6a.75.75 0 0 0-.75-.75m2.25 4.81v1.94h1.94zm3.62-5.92L13.2 6.57c-.3.3-.3.77 0 1.06l3.18 3.18c.3.3.77.3 1.06 0l3.18-3.18c.3-.3.3-.77 0-1.06l-3.18-3.18a.75.75 0 0 0-1.06 0" />
    </svg>
  );
}

export function FolderIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M3.5 6.25V8h4.63q.31 0 .53-.22l1.53-1.53-1.53-1.53a.8.8 0 0 0-.53-.22H5.25c-.97 0-1.75.78-1.75 1.75m-1.5 0C2 4.45 3.46 3 5.25 3h2.88c.6 0 1.17.24 1.59.66l1.84 1.84h7.19c1.8 0 3.25 1.46 3.25 3.25v9c0 1.8-1.46 3.25-3.25 3.25H5.25A3.25 3.25 0 0 1 2 17.75zM3.5 9.5v8.25c0 .97.78 1.75 1.75 1.75h13.5c.97 0 1.75-.78 1.75-1.75v-9c0-.97-.78-1.75-1.75-1.75h-7.19L9.72 8.84c-.42.42-1 .66-1.6.66z" />
    </svg>
  );
}

export function InboxIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M6.25 3h11.5a3.25 3.25 0 0 1 3.24 3.07l.01.18v11.5a3.25 3.25 0 0 1-3.07 3.24l-.18.01H6.25a3.25 3.25 0 0 1-3.24-3.07L3 17.75V6.25a3.25 3.25 0 0 1 3.07-3.24zh11.5zM4.5 14.5v3.25c0 .92.7 1.67 1.6 1.74l.15.01h11.5c.92 0 1.67-.7 1.74-1.6l.01-.15V14.5h-3.82a3.75 3.75 0 0 1-3.48 3H12a3.75 3.75 0 0 1-3.63-2.81l-.04-.19zv3.25zm13.25-10H6.25c-.92 0-1.67.7-1.74 1.6l-.01.15V13H9c.38 0 .7.28.74.65l.01.1a2.25 2.25 0 0 0 4.5.15v-.15c0-.38.28-.7.65-.74L15 13h4.5V6.25c0-.92-.7-1.67-1.6-1.74z" />
    </svg>
  );
}

export function DocumentIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M6 2a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L13.6 2.6A2 2 0 0 0 12.17 2zm-.5 2c0-.28.22-.5.5-.5h6V8c0 1.1.9 2 2 2h4.5v10a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5zm11.88 4.5H14a.5.5 0 0 1-.5-.5V4.62z" />
    </svg>
  );
}

export function ForwardIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M14.72 6.28a.75.75 0 0 1 1.06-1.06l5 5c.3.3.3.77 0 1.06l-5 5a.75.75 0 1 1-1.06-1.06l3.72-3.72h-7.69a6.25 6.25 0 0 0-6.25 6.25v.5a.75.75 0 0 1-1.5 0v-.5A7.75 7.75 0 0 1 10.75 10h7.69z" />
    </svg>
  );
}

export function WarningIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M9.14 3.7a3.25 3.25 0 0 1 5.72 0l6.74 12.5a3.25 3.25 0 0 1-2.86 4.8H5.25a3.25 3.25 0 0 1-2.86-4.8zm4.4.72a1.75 1.75 0 0 0-3.08 0L3.7 16.92a1.75 1.75 0 0 0 1.54 2.58h13.5a1.75 1.75 0 0 0 1.53-2.58zM12 15a1 1 0 1 1 0 2 1 1 0 0 1 0-2m0-7.5c.41 0 .75.34.75.75v4.5a.75.75 0 0 1-1.5 0v-4.5c0-.41.34-.75.75-.75" />
    </svg>
  );
}

export function ArchiveIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M10.25 11a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5zM3 5.25C3 4.01 4 3 5.25 3h13.5C19.99 3 21 4 21 5.25v1.5c0 .78-.4 1.47-1 1.87v8.63A3.75 3.75 0 0 1 16.25 21h-8.5A3.75 3.75 0 0 1 4 17.25V8.62c-.6-.4-1-1.09-1-1.87zM5.5 9v8.25c0 1.24 1 2.25 2.25 2.25h8.5c1.24 0 2.25-1 2.25-2.25V9zm-.25-4.5a.75.75 0 0 0-.75.75v1.5c0 .41.34.75.75.75h13.5c.41 0 .75-.34.75-.75v-1.5a.75.75 0 0 0-.75-.75z" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M4.22 8.47c.3-.3.77-.3 1.06 0L12 15.19l6.72-6.72a.75.75 0 1 1 1.06 1.06l-7.25 7.25c-.3.3-.77.3-1.06 0L4.22 9.53a.75.75 0 0 1 0-1.06" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M8.47 4.22c-.3.3-.3.77 0 1.06L15.19 12l-6.72 6.72a.75.75 0 1 0 1.06 1.06l7.25-7.25c.3-.3.3-.77 0-1.06L9.53 4.22a.75.75 0 0 0-1.06 0" />
    </svg>
  );
}

export function DismissIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="m4.4 4.55.07-.08a.75.75 0 0 1 .98-.07l.08.07L12 10.94l6.47-6.47a.75.75 0 1 1 1.06 1.06L13.06 12l6.47 6.47c.27.27.3.68.07.98l-.07.08a.75.75 0 0 1-.98.07l-.08-.07L12 13.06l-6.47 6.47a.75.75 0 0 1-1.06-1.06L10.94 12 4.47 5.53a.75.75 0 0 1-.07-.98l.07-.08z" />
    </svg>
  );
}

export function ArrowDownloadIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M18.25 20.5a.75.75 0 1 1 0 1.5h-13a.75.75 0 1 1 0-1.5zm-6.6-18.49h.1c.38 0 .7.28.74.64l.01.1v13.7l3.72-3.73a.75.75 0 0 1 .98-.07l.08.07c.27.27.3.68.07.98l-.07.08-5 5a.75.75 0 0 1-.97.07l-.09-.07-5-5a.75.75 0 0 1 .98-1.13l.08.07L11 16.43V2.76c0-.38.28-.7.65-.75h.1z" />
    </svg>
  );
}

export function MoreHorizontalIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M7.75 12a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0m6 0a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0M18 13.75a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5" />
    </svg>
  );
}

export function SignatureIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M14.75 16.5c1.3 0 1.82.58 2.2 1.87l.07.24c.19.66.3.86.52.95.26.1.43.09.7-.05l.15-.08.17-.11.67-.46c.61-.4 1.17-.67 1.84-.84a.75.75 0 1 1 .36 1.46q-.59.14-1.14.49l-.3.19-.48.33q-.33.22-.58.35a2.2 2.2 0 0 1-1.96.1c-.75-.3-1.05-.78-1.33-1.72l-.16-.54c-.18-.59-.3-.68-.73-.68q-.43-.01-1.07.52l-.18.16-.92.88c-1.41 1.32-2.61 1.97-4.33 1.97q-2.54 0-4.37-.77l2.95-.8q.67.06 1.42.07c1.18 0 2.03-.42 3.09-1.37l.25-.24.54-.5.59-.55c.68-.57 1.3-.87 2.03-.87m4.28-13.53a3.6 3.6 0 0 1 0 5.06l-.29.29c1.15 1.4 1.11 2.89.04 3.96l-2 2a.75.75 0 0 1-1.06-1.06l2-2c.48-.49.54-1.09-.04-1.84L9.06 18q-.42.43-1 .58l-5.11 1.4a.75.75 0 0 1-.92-.93l1.4-5.11q.16-.58.57-1l9.97-9.97a3.6 3.6 0 0 1 5.06 0m-4 1.06L5.06 14q-.14.14-.19.33l-1.05 3.85 3.85-1.05q.2-.05.33-.2l9.97-9.96a2.08 2.08 0 1 0-2.94-2.94" />
    </svg>
  );
}

export function FilterIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M13.5 16a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1 0-1.5zm3-5a.75.75 0 0 1 0 1.5h-9a.75.75 0 0 1 0-1.5zm3-5a.75.75 0 0 1 0 1.5h-15a.75.75 0 0 1 0-1.5z" />
    </svg>
  );
}

export function DatabaseIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M4 6c0-.7.32-1.3.77-1.78a6 6 0 0 1 1.8-1.2A14 14 0 0 1 12 2c2.08 0 4 .38 5.43 1.02q1.1.48 1.8 1.2c.45.49.77 1.09.77 1.78v12c0 .7-.32 1.3-.77 1.78q-.7.72-1.8 1.2A14 14 0 0 1 12 22c-2.08 0-4-.38-5.43-1.02a6 6 0 0 1-1.8-1.2A2.6 2.6 0 0 1 4 18zm1.5 0c0 .2.09.46.37.75q.4.46 1.31.86c1.2.54 2.9.89 4.82.89s3.62-.35 4.82-.89q.9-.4 1.31-.86c.28-.3.37-.54.37-.75s-.09-.46-.37-.75q-.4-.46-1.31-.86c-1.2-.54-2.9-.89-4.82-.89s-3.62.35-4.82.89q-.9.4-1.31.86c-.28.3-.37.54-.37.75m13 2.4a7 7 0 0 1-1.07.58A14 14 0 0 1 12 10c-2.08 0-4-.38-5.43-1.02A7 7 0 0 1 5.5 8.4V18c0 .2.09.46.37.75q.4.46 1.31.86c1.2.54 2.9.89 4.82.89s3.62-.35 4.82-.89q.9-.4 1.31-.86c.28-.3.37-.54.37-.75z" />
    </svg>
  );
}

export function ArrowUploadIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M18.25 3.51a.75.75 0 1 0 0-1.5h-13a.75.75 0 1 0 0 1.5zM11.65 22h.1c.38 0 .7-.28.74-.64l.01-.1V7.56l3.72 3.72c.27.27.68.29.98.07l.08-.07a.75.75 0 0 0 .07-.98l-.07-.08-5-5a.75.75 0 0 0-.97-.07l-.09.07-5 5a.75.75 0 0 0 .98 1.13l.08-.07L11 7.58v13.67c0 .38.28.7.65.75" />
    </svg>
  );
}

export function ArrowLeftIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M10.73 19.8a.75.75 0 0 0 1.04-1.1l-6.25-5.95h14.73a.75.75 0 0 0 0-1.5H5.52l6.25-5.95a.75.75 0 0 0-1.04-1.1l-7.42 7.08a1 1 0 0 0 0 1.44z" />
    </svg>
  );
}

export function ArrowRightIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M13.27 4.2a.75.75 0 0 0-1.04 1.1l6.25 5.95H3.75a.75.75 0 0 0 0 1.5h14.73l-6.25 5.95a.75.75 0 0 0 1.04 1.1l7.42-7.08a1 1 0 0 0 0-1.44z" />
    </svg>
  );
}

export function EmojiIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20m0 1.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17M8.46 14.78a4.5 4.5 0 0 0 7.07 0 .75.75 0 1 1 1.18.94 6 6 0 0 1-9.43 0 .75.75 0 1 1 1.18-.94M9 8.75a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5m6 0a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5" />
    </svg>
  );
}

export function LinkIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M9.25 7a.75.75 0 0 1 .11 1.5H7a3.5 3.5 0 0 0-.2 7h2.45a.75.75 0 0 1 .11 1.5H7a5 5 0 0 1-.25-10h2.5M17 7a5 5 0 0 1 .25 10h-2.5a.75.75 0 0 1-.11-1.5H17a3.5 3.5 0 0 0 .2-7h-2.45a.75.75 0 0 1-.11-1.5H17M7 11.25h10a.75.75 0 0 1 .1 1.5H7a.75.75 0 0 1-.1-1.5zh10z" />
    </svg>
  );
}

export function ImageIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M17.75 3C19.55 3 21 4.46 21 6.25v11.5c0 1.8-1.46 3.25-3.25 3.25H6.25A3.25 3.25 0 0 1 3 17.75V6.25C3 4.45 4.46 3 6.25 3zm.58 16.4-5.8-5.69a.75.75 0 0 0-.97-.07l-.08.07-5.81 5.7q.28.09.58.09h11.5q.3 0 .58-.1l-5.8-5.69zm-.58-14.9H6.25c-.97 0-1.75.78-1.75 1.75v11.5q0 .3.1.6l5.83-5.7a2.25 2.25 0 0 1 3.02-.12l.12.11 5.83 5.7q.1-.27.1-.59V6.25c0-.97-.78-1.75-1.75-1.75m-2.5 2a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5m0 1.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5" />
    </svg>
  );
}

export function AddIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M12 3.25c.41 0 .75.34.75.75v7.25H20a.75.75 0 0 1 0 1.5h-7.25V20a.75.75 0 0 1-1.5 0v-7.25H4a.75.75 0 0 1 0-1.5h7.25V4c0-.41.34-.75.75-.75" />
    </svg>
  );
}

export function ChatIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M12 2a10 10 0 1 1-4.59 18.89L3.6 21.96a1.25 1.25 0 0 1-1.54-1.54l1.06-3.83A10 10 0 0 1 12 2m0 1.5a8.5 8.5 0 0 0-7.43 12.64l.15.27-1.1 3.98 3.98-1.11.27.15A8.5 8.5 0 1 0 12 3.5M8.75 13h4.5a.75.75 0 0 1 .1 1.5h-4.6a.75.75 0 0 1-.1-1.5zh4.5zm0-3.5h6.5a.75.75 0 0 1 .1 1.5h-6.6a.75.75 0 0 1-.1-1.5zh6.5z" />
    </svg>
  );
}

export function ToggleLeftIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M7.25 14.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5M22 12a5 5 0 0 0-5-5H7a5 5 0 0 0 0 10h10a5 5 0 0 0 5-5m-5-3.5a3.5 3.5 0 1 1 0 7H7a3.5 3.5 0 1 1 0-7z" />
    </svg>
  );
}

export function SubtractIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M3.75 12.5h16.5a.75.75 0 0 0 0-1.5H3.75a.75.75 0 0 0 0 1.5" />
    </svg>
  );
}

export function MaximizeIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M5.75 3h12.5A2.75 2.75 0 0 1 21 5.75v12.5A2.75 2.75 0 0 1 18.25 21H5.75A2.75 2.75 0 0 1 3 18.25V5.75A2.75 2.75 0 0 1 5.75 3m0 1.5c-.69 0-1.25.56-1.25 1.25v12.5c0 .69.56 1.25 1.25 1.25h12.5c.69 0 1.25-.56 1.25-1.25V5.75c0-.69-.56-1.25-1.25-1.25z" />
    </svg>
  );
}

export function ArrowMinimizeIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M10.25 13c.41 0 .75.34.75.75v7.5a.75.75 0 0 1-1.5 0v-5.69l-6.22 6.22a.75.75 0 1 1-1.06-1.06l6.22-6.22H2.75a.75.75 0 0 1 0-1.5zM20.72 2.22a.75.75 0 1 1 1.06 1.06L15.56 9.5h5.69a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75v-7.5a.75.75 0 0 1 1.5 0v5.69z" />
    </svg>
  );
}

export function PlugConnectedIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M19.49 5.57a5.97 5.97 0 0 1-1.9 8.96c-.64.35-1.42.14-1.94-.38l-5.8-5.8c-.52-.52-.73-1.3-.38-1.95a6 6 0 0 1 8.96-1.89l2.29-2.29a.75.75 0 1 1 1.06 1.06zm-2.02 7.26a4.5 4.5 0 1 0-6.3-6.3c-.27.35-.19.83.12 1.14l5.04 5.04c.31.3.8.39 1.14.12M3.28 21.78l2.3-2.29a5.97 5.97 0 0 0 8.95-1.9c.35-.64.14-1.42-.38-1.94l-5.8-5.8c-.52-.52-1.3-.73-1.95-.38a6 6 0 0 0-1.89 8.96l-2.29 2.29a.75.75 0 1 0 1.06 1.06m4.39-10.49 5.04 5.04c.3.31.39.8.12 1.14a4.5 4.5 0 1 1-6.3-6.3c.35-.27.83-.19 1.14.12" />
    </svg>
  );
}

export function PdfIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M3.75 15a2.5 2.5 0 0 1 0 5H2.5v1.25a.75.75 0 0 1-1.5 0v-5.5c0-.41.34-.75.75-.75zM2.5 18.5h1.25a1 1 0 1 0 0-2H2.5zM9.25 15A2.75 2.75 0 0 1 12 17.75v1.5A2.75 2.75 0 0 1 9.25 22h-1.5a.75.75 0 0 1-.75-.75v-5.5c0-.41.34-.75.75-.75zm-.75 5.5h.75c.69 0 1.25-.56 1.25-1.25v-1.5c0-.69-.56-1.25-1.25-1.25H8.5zm8.25-5.5a.75.75 0 0 1 0 1.5H14.5V18h1.75a.75.75 0 0 1 0 1.5H14.5v1.75a.75.75 0 0 1-1.5 0v-5.5c0-.41.34-.75.75-.75zM12.13 2c.6 0 1.17.24 1.59.66l5.62 5.62c.42.42.66 1 .66 1.6v9.62a2.5 2.5 0 0 1-2.5 2.5h-2.17q.16-.34.17-.75v-.75h2a1 1 0 0 0 1-1V10H14a2 2 0 0 1-2-2V3.5H6.5a1 1 0 0 0-1 1V14H4V4.5A2.5 2.5 0 0 1 6.5 2zm1.37 6c0 .28.22.5.5.5h3.44L13.5 4.56z" />
    </svg>
  );
}

export function DocumentTableIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M8.75 11.5h6.5c.97 0 1.75.78 1.75 1.75v4c0 .97-.78 1.75-1.75 1.75h-6.5C7.78 19 7 18.22 7 17.25v-4c0-.97.78-1.75 1.75-1.75m-.25 1.75v1.25H10V13H8.75a.25.25 0 0 0-.25.25m0 2.75v1.25q.02.23.25.25H10V16zm3 0v1.5h3.75q.23-.02.25-.25V16zm4-1.5v-1.25a.25.25 0 0 0-.25-.25H11.5v1.5zM13.59 2.59c-.37-.37-.9-.59-1.42-.59H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42zM18 20.5H6a.5.5 0 0 1-.5-.5V4c0-.27.22-.5.5-.5h6V8c0 1.1.9 2 2 2h4.5v10a.5.5 0 0 1-.5.5m-.62-12H14a.5.5 0 0 1-.5-.5V4.62z" />
    </svg>
  );
}

export function SlideTextIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M6.75 8a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5zM6 11.75c0-.41.34-.75.75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1-.75-.75M6.75 14a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5zm-2-10A2.75 2.75 0 0 0 2 6.75v10.5A2.75 2.75 0 0 0 4.75 20h14.5A2.75 2.75 0 0 0 22 17.25V6.75A2.75 2.75 0 0 0 19.25 4zM3.5 6.75c0-.69.56-1.25 1.25-1.25h14.5c.69 0 1.25.56 1.25 1.25v10.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25z" />
    </svg>
  );
}

export function FolderZipIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M8.13 3c.6 0 1.17.24 1.59.66l1.84 1.84h7.19c1.8 0 3.25 1.46 3.25 3.25v9a3.25 3.25 0 0 1-3 3.24v1.4l-.01.12a.6.6 0 0 1-.48.48l-.13.01h-4.76a.6.6 0 0 1-.6-.5l-.02-.12V21H5.25A3.25 3.25 0 0 1 2 17.75V6.25C2 4.45 3.46 3 5.25 3zM16 16.5c-.83 0-1.5.67-1.5 1.5v3.5h3V18c0-.83-.67-1.5-1.5-1.5M9.72 8.84c-.42.42-1 .66-1.6.66H3.5v8.25c0 .97.78 1.75 1.75 1.75H13V18a3 3 0 0 1 1.34-2.5h-.59a.75.75 0 0 1 0-1.5H16v1a3 3 0 0 1 3 3v1.48c.85-.12 1.5-.85 1.5-1.73v-9c0-.97-.78-1.75-1.75-1.75h-7.19zm8.53 3.66a.75.75 0 0 1 0 1.5H16v-1.5zm-2.25 0h-2.25a.75.75 0 0 1 0-1.5H16zm2.25-3a.75.75 0 0 1 0 1.5H16V9.5zM16 9.5h-2.25a.75.75 0 0 1 0-1.5H16zm-10.75-5c-.97 0-1.75.78-1.75 1.75V8h4.63q.31 0 .53-.22l1.53-1.53-1.53-1.53a.8.8 0 0 0-.53-.22z" />
    </svg>
  );
}

export function BroomIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M22.45 1.92c.3.3.3.77 0 1.06l-6.93 6.93a5.75 5.75 0 0 1-.5 7.57l-.82.83-2.79 4.18a.75.75 0 0 1-1.15.12l-8.49-8.49a.75.75 0 0 1 .11-1.15l4.19-2.8.83-.82a5.75 5.75 0 0 1 7.56-.5l6.93-6.93c.3-.29.77-.29 1.06 0M7.6 10.76l6.01 6.01.36-.35a4.25 4.25 0 0 0-6.01-6.01zm-1.15.97L3.48 13.7l7.19 7.19 1.98-2.97z" />
    </svg>
  );
}

export function FlashIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M7.43 2.83C7.6 2.33 8.07 2 8.6 2h6.46c.85 0 1.45.84 1.18 1.65L14.8 8h3.96c1.1 0 1.67 1.33.9 2.12L8.59 21.54c-1.06 1.08-2.88.1-2.55-1.38l1.27-5.66-1.56-.01c-1.21 0-2.05-1.2-1.65-2.34zm1.35.67-3.26 9.16c-.06.16.06.33.23.33l2.5.01a.75.75 0 0 1 .73.91L7.51 20.5 18.16 9.5h-4.41a.75.75 0 0 1-.71-.99L14.7 3.5z" />
    </svg>
  );
}

export function MailReadIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M13.2 2.34a2.3 2.3 0 0 0-2.4 0L3.07 7.17A2.3 2.3 0 0 0 2 9.08v7.67C2 18.55 3.46 20 5.25 20h13.5c1.8 0 3.25-1.46 3.25-3.25V9.08c0-.77-.4-1.5-1.06-1.9zM11.6 3.6a.8.8 0 0 1 .8 0l7.24 4.52L12 12.15 4.36 8.13zM3.5 9.37l8.15 4.3q.35.15.7 0l8.15-4.3v7.38c0 .97-.78 1.75-1.75 1.75H5.25c-.97 0-1.75-.78-1.75-1.75z" />
    </svg>
  );
}

export function MailUnreadIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M22 7.83a3 3 0 1 0-2-5.66 3 3 0 0 0 2 5.66M5.25 4h11.36a5 5 0 0 0-.08 1.5H5.25c-.92 0-1.67.7-1.74 1.6l-.01.15v.43l8.5 4.47 6.5-3.41q.82.55 1.85.71l-8 4.21q-.3.15-.6.05l-.1-.05L3.5 9.37v7.38c0 .92.7 1.67 1.6 1.74l.15.01h13.5c.92 0 1.67-.7 1.74-1.6l.01-.15V9.47A5 5 0 0 0 22 9.4v7.36a3.25 3.25 0 0 1-3.07 3.24l-.18.01H5.25a3.25 3.25 0 0 1-3.24-3.07L2 16.75v-9.5a3.25 3.25 0 0 1 3.07-3.24z" />
    </svg>
  );
}

export function ShieldErrorIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M20.25 5q-3.99 0-7.8-2.85a.75.75 0 0 0-.9 0Q7.74 5 3.75 5a.75.75 0 0 0-.75.75V11c0 5 2.96 8.68 8.73 10.95q.27.1.54 0C18.04 19.68 21 16 21 11V5.75a.75.75 0 0 0-.75-.75M4.5 6.48a14.4 14.4 0 0 0 7.5-2.8 14.4 14.4 0 0 0 7.5 2.8V11c0 4.26-2.45 7.38-7.5 9.44-5.05-2.06-7.5-5.18-7.5-9.44zm8.24 1.17a.75.75 0 0 0-1.49.1v6.6a.75.75 0 0 0 1.5-.1v-6.6M12 18a1 1 0 1 0 0-2 1 1 0 0 0 0 2" />
    </svg>
  );
}

export function ArrowSyncIcon({ size = 20, style, ...rest }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'currentColor', ...style }} {...rest}>
      <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
    </svg>
  );
}
