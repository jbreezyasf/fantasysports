'use client';

import { useState } from 'react';
import { FranchiseCrest } from './FranchiseCrest';

type Props={nameLabel?:string;namePlaceholder?:string;primary?:string;secondary?:string};

export function FranchiseIdentityFields({nameLabel='Franchise name',namePlaceholder='Milwaukee Voltage',primary='#c7a24b',secondary='#0b0c0f'}:Props){
  const [name,setName]=useState('');
  const [abbr,setAbbr]=useState('');
  const [primaryColor,setPrimaryColor]=useState(primary);
  const [secondaryColor,setSecondaryColor]=useState(secondary);
  const previewName=name.trim()||'Your Franchise';
  const previewAbbr=(abbr.trim()||name.trim().split(/\s+/).map(word=>word[0]).join('').slice(0,3)||'BEX').toUpperCase();
  return <div className="franchiseIdentityBuilder">
    <div className="franchiseLogoPreview" style={{'--preview-primary':primaryColor} as React.CSSProperties} aria-live="polite">
      <FranchiseCrest name={previewName} abbreviation={previewAbbr} primary={primaryColor} secondary={secondaryColor}/>
      <div><span>YOUR FRANCHISE MARK</span><strong>{previewName}</strong><small>{previewAbbr} • GENERATED LIVE</small></div>
    </div>
    <label>{nameLabel}<input name="franchise_name" required placeholder={namePlaceholder} value={name} onChange={event=>setName(event.target.value)}/></label>
    <label>Abbreviation<input name="abbreviation" maxLength={5} placeholder="MIL" value={abbr} onChange={event=>setAbbr(event.target.value.toUpperCase())}/></label>
    <div className="colorRow"><label>Primary color<input name="primary_color" type="color" value={primaryColor} onChange={event=>setPrimaryColor(event.target.value)}/></label><label>Secondary color<input name="secondary_color" type="color" value={secondaryColor} onChange={event=>setSecondaryColor(event.target.value)}/></label></div>
    <p className="identityBuilderNote">Your original Big Exec crest appears across your stadium, matchups, league, and recaps. You can change your identity later.</p>
  </div>;
}
