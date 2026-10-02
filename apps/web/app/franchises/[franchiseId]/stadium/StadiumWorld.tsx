'use client';

import dynamic from 'next/dynamic';
import { Component, useEffect, useState, type ReactNode } from 'react';
import type { StadiumWorldPrototypeProps } from './StadiumWorldPrototype';

// Three.js/R3F only ever loads in the browser and only on the Stadium route.
const StadiumWorldPrototype = dynamic(
  () => import('./StadiumWorldPrototype').then((mod) => mod.StadiumWorldPrototype),
  { ssr: false, loading: () => <div className="stadiumWorldLoading" role="status">Loading your 3D stadium…</div> }
);

type Mode = 'checking' | '3d' | '2d';

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

class WorldErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <>
        <p className="stadiumWorldNotice" role="status">3D rendering stopped on this device, so you are seeing the standard stadium view.</p>
        {this.props.fallback}
      </>;
    }
    return this.props.children;
  }
}

export function StadiumWorld({ fallback, force2d = false, ...props }: StadiumWorldPrototypeProps & { fallback: ReactNode; force2d?: boolean }) {
  const [mode, setMode] = useState<Mode>('checking');
  const [webglAvailable, setWebglAvailable] = useState(false);

  useEffect(() => {
    const available = !force2d && supportsWebGL();
    setWebglAvailable(available);
    setMode(available ? '3d' : '2d');
  }, [force2d]);

  if (mode === 'checking') return <div className="stadiumWorldLoading" role="status">Preparing your stadium…</div>;

  if (mode === '3d') {
    return <div className="stadiumWorldHost" data-stadium-mode="3d">
      <WorldErrorBoundary fallback={fallback}><StadiumWorldPrototype {...props} onStandardView={() => setMode('2d')} /></WorldErrorBoundary>
    </div>;
  }

  return <div className="stadiumWorldHost" data-stadium-mode="2d">
    <div className="stadiumWorldModeBar">
      {webglAvailable
        ? <button type="button" className="secondary stadiumWorldModeToggle" onClick={() => setMode('3d')}>Enter 3D stadium</button>
        : <p className="stadiumWorldNotice" role="status">3D is not available on this device. Your stadium data is shown in the standard view.</p>}
    </div>
    {fallback}
  </div>;
}
