import Image from 'next/image';

export default function BigExecBrand({ compact=false }:{ compact?:boolean }) {
  return <a className={`bigExecBrand ${compact?'compact':''}`} href="/" aria-label="Big Exec Fantasy Sports home">
    <Image src="/brand/big-exec-approved-wordmark-v1.png" width={454} height={150} priority={!compact} alt="Big Exec Fantasy Sports — Run the franchise. Own the season." />
  </a>;
}
