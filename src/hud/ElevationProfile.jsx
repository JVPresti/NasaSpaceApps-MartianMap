import { t } from '../i18n/index.js';
import { useMemo } from 'react';
import { buildProfile, slopeClass } from './profile.js';
import './elevation.css';

const W = 360;
const H = 88;
const PAD = 8;

/**
 * Small SVG elevation chart: distance on x, height on y. Steep sections use the
 * slope-legend colours; waypoints are numbered ticks; the current position is a
 * vertical line in Walk mode.
 *
 * @param {{ path: Array<[number, number]> | null, waypoints: Array<object>,
 *   heightAt: ((x: number, z: number) => number) | undefined,
 *   slopeAt?: ((x: number, z: number) => number) | undefined,
 *   position?: { x: number, z: number } | null, compact?: boolean }} props
 */
export default function ElevationProfile({ path, waypoints, heightAt, slopeAt, position, compact = false }) {
  const positionX = position?.x;
  const positionZ = position?.z;
  const profile = useMemo(
    () => (heightAt ? buildProfile(path, waypoints, heightAt, {
      slopeAt,
      position: Number.isFinite(positionX) && Number.isFinite(positionZ) ? { x: positionX, z: positionZ } : null,
    }) : null),
    [path, waypoints, heightAt, slopeAt, positionX, positionZ],
  );

  if (!profile) return null;
  const { samples, waypoints: marks, totalM, minHeightM, maxHeightM, positionM } = profile;
  const range = Math.max(0.01, maxHeightM - minHeightM);
  const x = (distanceM) => PAD + (distanceM / totalM) * (W - PAD * 2);
  const y = (heightM) => H - PAD - ((heightM - minHeightM) / range) * (H - PAD * 2);
  const area = `M${x(0)} ${H - PAD} ${samples.map((sample) => `L${x(sample.distanceM)} ${y(sample.heightM)}`).join(' ')} L${x(totalM)} ${H - PAD} Z`;
  const label = t('ui.elevation.profile.p0.m.p1.to.p2.m', { p0: Math.round(totalM), p1: Math.round(minHeightM), p2: Math.round(maxHeightM) });
  const heightAtDistance = (distanceM) => {
    if (samples.length < 2) return samples[0]?.heightM ?? 0;
    const t = Math.max(0, Math.min(1, distanceM / totalM)) * (samples.length - 1);
    const index = Math.min(samples.length - 2, Math.floor(t));
    const fraction = t - index;
    return samples[index].heightM + (samples[index + 1].heightM - samples[index].heightM) * fraction;
  };

  return (
    <figure className={'elevation-profile' + (compact ? ' compact' : '')} aria-label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <path d={area} className="elevation-area" />
        {samples.slice(0, -1).map((sample, index) => {
          const next = samples[index + 1];
          return (
            <line
              key={`s${index}`}
              x1={x(sample.distanceM)} y1={y(sample.heightM)}
              x2={x(next.distanceM)} y2={y(next.heightM)}
              className={'elevation-line ' + slopeClass(Math.max(sample.slopeDeg, next.slopeDeg))}
            />
          );
        })}
        {marks.map((mark) => (
          <g key={`w${mark.index}`} className="elevation-waypoint">
            <line x1={x(mark.distanceM)} y1={PAD} x2={x(mark.distanceM)} y2={H - PAD} />
            <circle cx={x(mark.distanceM)} cy={y(heightAtDistance(mark.distanceM))} r="2.6" />
            <text x={x(mark.distanceM)} y={PAD - 1} textAnchor="middle">{mark.index + 1}</text>
          </g>
        ))}
        {Number.isFinite(positionM) && (
          <g className="elevation-position">
            <line x1={x(positionM)} y1={PAD} x2={x(positionM)} y2={H - PAD} />
            <circle cx={x(positionM)} cy={y(heightAtDistance(positionM))} r="3" />
          </g>
        )}
        <text x={PAD} y={H - 1} className="elevation-label">{Math.round(minHeightM)}{t('units.metresSuffix')}</text>
        <text x={W - PAD} y={H - 1} className="elevation-label" textAnchor="end">{Math.round(maxHeightM)}{t('units.metresSuffix')}</text>
      </svg>
    </figure>
  );
}
