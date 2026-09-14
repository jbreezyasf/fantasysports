import React from 'react';

export default function BigExecCrownMark({className='',priority=false}:{className?:string;priority?:boolean}) {
  return <img className={className} src="/brand/be-crown-mark-v1.webp" width="256" height="256" loading={priority?'eager':'lazy'} alt="" aria-hidden="true"/>;
}
