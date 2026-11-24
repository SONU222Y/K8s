import { useEffect, useMemo, useRef, useState } from 'react';

import CircularCarousel from './components/CircularCarousel/CircularCarousel';
import { NUMERALS, VOLUMES } from './data/places';
import { plateFor } from './data/plates';

// Generate every plate once, so the image strings stay stable between renders.
const PLATES = VOLUMES.map(volume => volume.places.map((place, index) => plateFor(volume, place, index)));

const SHAPES = [
  { id: 'cylinder', label: 'Cylinder' },
  { id: 'orbit', label: 'Orbit' },
  { id: 'wheel', label: 'Wheel' },
  { id: 'panorama', label: 'Panorama' }
];

const MOTIONS = [
  { id: 'drift', label: 'Drift' },
  { id: 'step', label: 'Step' },
  { id: 'off', label: 'Still' }
];

function Segmented({ id, label, options, value, onChange }) {
  return (
    <div className="control" role="group" aria-labelledby={id}>
      <span id={id} className="label">
        {label}
      </span>
      <div className="seg">
        {options.map(option => (
          <button
            key={option.id}
            type="button"
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PlateMeta({ volume, index }) {
  return (
    <span className="plate-meta">
      Vol. {volume.numeral} · Plate {NUMERALS[index]}
    </span>
  );
}

function Lightbox({ volume, volumeIndex, index, onClose }) {
  const closeRef = useRef(null);
  const place = volume.places[index];

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKey = event => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-labelledby="lightbox-title" onClick={onClose}>
      <div className="sheet" onClick={event => event.stopPropagation()}>
        <img src={PLATES[volumeIndex][index]} alt={`${place.name}, ${place.region}`} />
        <div className="sheet-text">
          <PlateMeta volume={volume} index={index} />
          <h2 id="lightbox-title">{place.name}</h2>
          <p className="region">{place.region}</p>
          <dl className="facts">
            <div>
              <dt>Position</dt>
              <dd>{place.coords}</dd>
            </div>
            <div>
              <dt>Elevation</dt>
              <dd>{place.elev}</dd>
            </div>
          </dl>
          <p className="note">{place.note}</p>
          <button ref={closeRef} type="button" className="close" onClick={onClose}>
            Close plate
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [volumeIndex, setVolumeIndex] = useState(0);
  const [preset, setPreset] = useState('cylinder');
  const [motion, setMotion] = useState('drift');
  const [active, setActive] = useState(0);
  const [openIndex, setOpenIndex] = useState(null);

  const volume = VOLUMES[volumeIndex];
  const place = volume.places[active] ?? volume.places[0];

  const items = useMemo(
    () =>
      volume.places.map((p, i) => ({
        src: PLATES[volumeIndex][i],
        alt: `${p.name}, ${p.region}`,
        title: p.name,
        subtitle: p.region
      })),
    [volume, volumeIndex]
  );

  return (
    <div className="app">
      <header className="masthead">
        <div className="title-block">
          <span className="eyebrow">A field atlas of places that do not exist</span>
          <h1>
            Atlas of <em>Elsewhere</em>
          </h1>
        </div>
        <nav className="volumes" aria-label="Volumes">
          {VOLUMES.map((v, i) => (
            <button key={v.id} type="button" aria-pressed={i === volumeIndex} onClick={() => setVolumeIndex(i)}>
              <span className="numeral">{v.numeral}</span>
              <span className="vol-name">{v.name}</span>
            </button>
          ))}
        </nav>
      </header>

      <p className="blurb">
        <span className="vol-tag">Volume {volume.numeral}</span> {volume.blurb}
      </p>

      <section className="ring-wrap" aria-label={`${volume.name} plates`}>
        <CircularCarousel
          items={items}
          preset={preset}
          intro="rise"
          autoplay={motion}
          cardWidth={210}
          aspectRatio={400 / 512}
          gap={22}
          speed={12}
          interval={3.5}
          cornerRadius={6}
          fadeColor="var(--bg)"
          depthFade={0.6}
          onChange={setActive}
          onItemClick={(_, index) => setOpenIndex(index)}
        />
      </section>

      <section className="readout">
        <article className="plate" aria-live="polite">
          <PlateMeta volume={volume} index={active} />
          <h2 key={`${volume.id}-${active}`}>{place.name}</h2>
          <p className="region">{place.region}</p>
          <dl className="facts">
            <div>
              <dt>Position</dt>
              <dd>{place.coords}</dd>
            </div>
            <div>
              <dt>Elevation</dt>
              <dd>{place.elev}</dd>
            </div>
          </dl>
          <p className="note">{place.note}</p>
          <button type="button" className="open" onClick={() => setOpenIndex(active)}>
            Open plate {NUMERALS[active]}
          </button>
        </article>

        <aside className="controls">
          <Segmented id="shape-label" label="Shape" options={SHAPES} value={preset} onChange={setPreset} />
          <Segmented id="motion-label" label="Motion" options={MOTIONS} value={motion} onChange={setMotion} />
          <p className="hint">
            Drag or flick to turn the ring. Click a plate to bring it forward, or focus the ring and use <kbd>←</kbd>{' '}
            <kbd>→</kbd> and <kbd>Enter</kbd>.
          </p>
        </aside>
      </section>

      {openIndex !== null && (
        <Lightbox volume={volume} volumeIndex={volumeIndex} index={openIndex} onClose={() => setOpenIndex(null)} />
      )}
    </div>
  );
}
