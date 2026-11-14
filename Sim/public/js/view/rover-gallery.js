import {
  matchObservationToStop,
  nearestStop,
  OBSERVATION_DISCLAIMER,
  parseObservationManifest,
  resolvePointing,
  SITE_FRAME_ASSUMPTION,
} from '../geo/rover-observations.js';

const CAMERA_LABELS = Object.freeze({
  NAVCAM_LEFT: 'Sol Navcam',
  NAVCAM_RIGHT: 'Sağ Navcam',
  MCZ_LEFT: 'Sol Mastcam-Z',
  MCZ_RIGHT: 'Sağ Mastcam-Z',
  FRONT_HAZCAM_LEFT_A: 'Sol ön Hazcam',
  FRONT_HAZCAM_RIGHT_A: 'Sağ ön Hazcam',
  SUPERCAM_RMI: 'SuperCam RMI',
  CACHECAM: 'CacheCam',
});

// Imported file paths must name one of the project's locally served archive JPEGs.
const LOCAL_IMAGE_PATH = /^data\/perseverance-raw\/sol\d+\/[a-z0-9_-]+\.jpg$/i;

export function createRoverGallery({ container, stops, onPointCamera }) {
  const doc = container.ownerDocument;
  let observationsByStop = new Map();
  let status = 'loading';
  let lastKey = '';

  function append(parent, tag, content) {
    const el = doc.createElement(tag);
    if (content) el.textContent = content;
    parent.append(el);
    return el;
  }

  function setManifest(manifest) {
    const result = parseObservationManifest(manifest);
    observationsByStop = new Map();
    for (const observation of result.observations) {
      const match = matchObservationToStop(observation, stops);
      if (!match.matched || !LOCAL_IMAGE_PATH.test(observation.localFile ?? '')) continue;
      const rows = observationsByStop.get(match.stop.id) ?? [];
      rows.push(observation);
      observationsByStop.set(match.stop.id, rows);
    }
    status = observationsByStop.size ? 'ready' : 'unavailable';
    lastKey = '';
  }

  function update(position, { firstPerson = false } = {}) {
    const location = nearestStop(position, stops);
    const stop = location.matched ? location.stop : null;
    const key = JSON.stringify([status, stop?.id, firstPerson]);
    if (key === lastKey) return;
    lastKey = key;
    container.replaceChildren();
    append(container, 'h2', 'Perseverance arşiv fotoğrafları');
    if (status !== 'ready') {
      append(container, 'p', status === 'loading' ? 'Fotoğraf arşivi yükleniyor…' : 'Fotoğraf arşivi kullanılamıyor.');
      return;
    }
    const observations = stop && observationsByStop.get(stop.id);
    if (!observations?.length) {
      append(container, 'p', 'Fotoğrafları görmek için WB1 veya Roubion durağına yaklaş.');
      return;
    }
    append(container, 'p', `Arşiv durağı · Site ${stop.site} / Drive ${stop.drive}`);
    append(container, 'p', OBSERVATION_DISCLAIMER);
    for (const observation of observations) {
      const label = CAMERA_LABELS[observation.instrument] ?? observation.instrument;
      const figure = append(container, 'figure');
      const image = append(figure, 'img');
      image.src = observation.localFile;
      image.alt = `Perseverance, Sol ${observation.sol}, ${label}`;
      image.loading = 'lazy';
      const caption = append(figure, 'figcaption');
      append(caption, 'strong', `Sol ${observation.sol} · ${label}`);
      append(caption, 'div', `LMST ${observation.lmst}`);
      if (observation.utc) append(caption, 'div', `UTC ${observation.utc}`);
      append(caption, 'div', observation.credit);

      // The 22A audit reports a mismatch between the SuperCam camera axis and mast angles.
      if (!firstPerson || !onPointCamera || observation.instrument === 'SUPERCAM_RMI') continue;
      const pointing = resolvePointing(observation, { acceptAssumption: SITE_FRAME_ASSUMPTION });
      if (!pointing.available) continue;
      append(caption, 'p', 'Tahmini yön, doğrulanmamış site çerçevesi varsayımına dayanır.');
      const button = append(caption, 'button', 'Rover kamerasının tahmini yönüne bak');
      button.type = 'button';
      button.addEventListener('click', () => onPointCamera(pointing.camera));
    }
  }

  return { setManifest, update };
}
