import React from 'react';

type FranchiseCrestProps = {
  name: string;
  abbreviation?: string | null;
  primary?: string | null;
  secondary?: string | null;
  avatarKey?: string | null;
  className?: string;
  decorative?: boolean;
};

export const franchiseAvatarOptions = [
  { key: 'classic', label: 'Classic Shield' },
  { key: 'crown', label: 'Crown House' },
  { key: 'tower', label: 'Executive Tower' },
  { key: 'orbit', label: 'Legacy Orbit' }
] as const;

export type FranchiseAvatarKey = typeof franchiseAvatarOptions[number]['key'];

function markSeed(value:string) {
  return Array.from(value).reduce((total,char)=>((total*31)+char.charCodeAt(0))>>>0,2166136261);
}

function normalizeAvatarKey(value?: string | null): FranchiseAvatarKey {
  return franchiseAvatarOptions.some(option => option.key === value) ? value as FranchiseAvatarKey : 'classic';
}

export function FranchiseCrest({name,abbreviation,primary='#d9b43b',secondary='#f5f1e8',avatarKey,className='',decorative=false}:FranchiseCrestProps) {
  const letters=(abbreviation?.trim()||name.slice(0,3)||'BEX').slice(0,3).toUpperCase();
  const selectedAvatar=normalizeAvatarKey(avatarKey);
  const seed=markSeed(`${name}|${letters}|${selectedAvatar}`);
  const label=`${name} franchise crest`;
  const gradientId=`crest-${selectedAvatar}-${seed}`;
  const glowId=`glow-${selectedAvatar}-${seed}`;
  return <svg className={`generatedFranchiseCrest ${className}`.trim()} viewBox="0 0 120 140" role={decorative?undefined:'img'} aria-hidden={decorative||undefined} aria-label={decorative?undefined:label}>
    <defs>
      <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1"><stop stopColor={primary||'#d9b43b'}/><stop offset="1" stopColor={secondary||'#f5f1e8'}/></linearGradient>
      <filter id={glowId}><feGaussianBlur stdDeviation="2.4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <path d="M60 4 111 25 101 101 60 136 19 101 9 25Z" fill="#07090e" stroke={`url(#${gradientId})`} strokeWidth="5"/>
    <path d="M60 15 99 31 91 94 60 121 29 94 21 31Z" fill={primary||'#d9b43b'} opacity=".18"/>
    {selectedAvatar==='classic'&&<path d="M22 47 60 20 98 47 87 54 60 36 33 54Z" fill={primary||'#d9b43b'} opacity=".95"/>}
    {selectedAvatar==='crown'&&<path d="M22 44 42 23 60 42 78 23 98 44 88 56 60 50 32 56Z" fill={primary||'#d9b43b'} opacity=".95"/>}
    {selectedAvatar==='tower'&&<><path d="M45 22h30l7 35H38Z" fill={primary||'#d9b43b'} opacity=".95"/><path d="M52 28h16v28H52Z" fill="#080a10" opacity=".5"/></>}
    {selectedAvatar==='orbit'&&<><circle cx="60" cy="38" r="18" fill="none" stroke={primary||'#d9b43b'} strokeWidth="4"/><path d="M22 50c19-19 57-19 76 0" fill="none" stroke={secondary||'#f5f1e8'} strokeWidth="4"/><path d="M24 42c24 16 48 16 72 0" fill="none" stroke={primary||'#d9b43b'} strokeWidth="3" opacity=".76"/></>}
    <path d="M31 62h58v43H31z" fill="#080a10" stroke={secondary||'#f5f1e8'} strokeOpacity=".28"/>
    <text x="60" y="94" textAnchor="middle" fill={secondary||'#f5f1e8'} fontFamily="Arial Black,Arial,sans-serif" fontSize={letters.length>2?'28':'36'} fontWeight="900" letterSpacing="0" filter={`url(#${glowId})`}>{letters}</text>
    <path d="M38 111h44" stroke={primary||'#d9b43b'} strokeWidth="4"/>
  </svg>;
}
