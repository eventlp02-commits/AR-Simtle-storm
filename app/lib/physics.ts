export interface Point2D {
  x: number;
  y: number;
}

export interface HeadCollider {
  points: Point2D[];
  trackingCenter: Point2D;
  velocity: Point2D;
  timestampMs: number;
}

export interface ParticleBody {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  vx: number;
  vy: number;
  radius: number;
}

const dot = (a: Point2D, b: Point2D) => a.x * b.x + a.y * b.y;
const subtract = (a: Point2D, b: Point2D): Point2D => ({ x: a.x - b.x, y: a.y - b.y });
const MAX_COLLISION_SPEED = 1_600;
const MAX_TRACKED_HEAD_SPEED = 1_400;
const POINT_EMA_ALPHA = 0.42;
const VELOCITY_EMA_ALPHA = 0.35;

const clockwiseInScreenSpace = (points: Point2D[]) => {
  let signedAreaTwice = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    signedAreaTwice += current.x * next.y - next.x * current.y;
  }
  return signedAreaTwice >= 0 ? points : [...points].reverse();
};

export function buildHeadCollider(
  oval: Point2D[],
  previous: HeadCollider | null,
  timestampMs: number,
  pointCount = 16,
): HeadCollider {
  if (oval.length < 3) {
    return {
      points: [],
      trackingCenter: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      timestampMs,
    };
  }

  const sampled = clockwiseInScreenSpace(
    Array.from({ length: pointCount }, (_, index) => {
      const sourceIndex = Math.floor((index / pointCount) * oval.length) % oval.length;
      return { ...oval[sourceIndex] };
    }),
  );

  const stablePrevious = previous?.points.length === pointCount ? previous : null;
  const points = stablePrevious
    ? sampled.map((point, index) => ({
        x:
          stablePrevious.points[index].x +
          (point.x - stablePrevious.points[index].x) * POINT_EMA_ALPHA,
        y:
          stablePrevious.points[index].y +
          (point.y - stablePrevious.points[index].y) * POINT_EMA_ALPHA,
      }))
    : sampled;

  const sampledCenter = centroid(sampled);
  const oldCenter = stablePrevious ? stablePrevious.trackingCenter : sampledCenter;
  const deltaSeconds = stablePrevious
    ? Math.max((timestampMs - stablePrevious.timestampMs) / 1_000, 1 / 120)
    : 0;
  const clampTrackedSpeed = (value: number) =>
    Math.max(-MAX_TRACKED_HEAD_SPEED, Math.min(MAX_TRACKED_HEAD_SPEED, value));
  const smoothedVelocity = (axis: "x" | "y") => {
    if (!deltaSeconds || !stablePrevious) return 0;
    const rawVelocity = clampTrackedSpeed(
      (sampledCenter[axis] - oldCenter[axis]) / deltaSeconds,
    );
    return clampTrackedSpeed(
      stablePrevious.velocity[axis] * (1 - VELOCITY_EMA_ALPHA) +
        rawVelocity * VELOCITY_EMA_ALPHA,
    );
  };

  return {
    points,
    trackingCenter: sampledCenter,
    velocity: { x: smoothedVelocity("x"), y: smoothedVelocity("y") },
    timestampMs,
  };
}

export function interpolateHeadCollider(
  current: HeadCollider | null,
  target: HeadCollider | null,
  alpha: number,
): HeadCollider | null {
  if (!current) return target;
  if (!target) return current;
  if (current.points.length !== target.points.length) return target;
  const amount = Math.max(0, Math.min(1, alpha));
  const interpolatePoint = (from: Point2D, to: Point2D): Point2D => ({
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  });

  return {
    points: current.points.map((point, index) =>
      interpolatePoint(point, target.points[index]),
    ),
    trackingCenter: interpolatePoint(current.trackingCenter, target.trackingCenter),
    velocity: interpolatePoint(current.velocity, target.velocity),
    timestampMs: target.timestampMs,
  };
}

function centroid(points: Point2D[]): Point2D {
  if (!points.length) return { x: 0, y: 0 };
  return points.reduce(
    (sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }),
    { x: 0, y: 0 },
  );
}

function pointInPolygon(point: Point2D, points: Point2D[]) {
  let inside = false;
  for (let current = 0, previous = points.length - 1; current < points.length; previous = current++) {
    const a = points[current];
    const b = points[previous];
    const crosses =
      (a.y > point.y) !== (b.y > point.y) &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function resolveParticleCollision(
  particle: ParticleBody,
  collider: HeadCollider,
  restitution = 0.9,
  friction = 0.04,
  headImpulse = 1.35,
): boolean {
  if (collider.points.length < 3) return false;

  const start = { x: particle.previousX, y: particle.previousY };
  const end = { x: particle.x, y: particle.y };
  const endInside = pointInPolygon(end, collider.points);
  const movement = subtract(end, start);
  let earliest:
    | { time: number; normal: Point2D; point: Point2D }
    | undefined;
  let closestPenetration:
    | { distance: number; normal: Point2D; anchor: Point2D }
    | undefined;

  for (let index = 0; index < collider.points.length; index += 1) {
    const a = collider.points[index];
    const b = collider.points[(index + 1) % collider.points.length];
    const edge = subtract(b, a);
    const edgeLength = Math.hypot(edge.x, edge.y);
    if (edgeLength < 0.0001) continue;
    const tangent = { x: edge.x / edgeLength, y: edge.y / edgeLength };
    const normal = { x: tangent.y, y: -tangent.x };
    const startDistance = dot(subtract(start, a), normal);
    const endDistance = dot(subtract(end, a), normal);
    const projectionAtEnd = dot(subtract(end, a), tangent);

    if (
      startDistance > particle.radius &&
      endDistance <= particle.radius &&
      Math.abs(startDistance - endDistance) > 0.0001
    ) {
      const time = (startDistance - particle.radius) / (startDistance - endDistance);
      const hit = { x: start.x + movement.x * time, y: start.y + movement.y * time };
      const projection = dot(subtract(hit, a), tangent);
      if (projection >= -particle.radius && projection <= edgeLength + particle.radius) {
        if (!earliest || time < earliest.time) {
          earliest = { time, normal, point: hit };
        }
      }
    }

    if (
      endInside &&
      endDistance <= particle.radius &&
      projectionAtEnd >= -particle.radius &&
      projectionAtEnd <= edgeLength + particle.radius
    ) {
      if (!closestPenetration || endDistance > closestPenetration.distance) {
        closestPenetration = { distance: endDistance, normal, anchor: a };
      }
    }
  }

  const collision = earliest
    ? { normal: earliest.normal, distance: particle.radius, point: earliest.point }
    : closestPenetration
      ? { normal: closestPenetration.normal, distance: closestPenetration.distance, point: end }
      : null;
  if (!collision) return false;

  particle.x = collision.point.x + collision.normal.x * (particle.radius - collision.distance + 0.5);
  particle.y = collision.point.y + collision.normal.y * (particle.radius - collision.distance + 0.5);

  const relative = {
    x: particle.vx - collider.velocity.x * headImpulse,
    y: particle.vy - collider.velocity.y * headImpulse,
  };
  const normalSpeed = dot(relative, collision.normal);
  if (normalSpeed < 0) {
    const normalVelocity = {
      x: collision.normal.x * normalSpeed,
      y: collision.normal.y * normalSpeed,
    };
    const tangentVelocity = {
      x: relative.x - normalVelocity.x,
      y: relative.y - normalVelocity.y,
    };
    particle.vx =
      -normalVelocity.x * restitution + tangentVelocity.x * (1 - friction) + collider.velocity.x * headImpulse;
    particle.vy =
      -normalVelocity.y * restitution + tangentVelocity.y * (1 - friction) + collider.velocity.y * headImpulse;
    const speed = Math.hypot(particle.vx, particle.vy);
    if (speed > MAX_COLLISION_SPEED) {
      const velocityScale = MAX_COLLISION_SPEED / speed;
      particle.vx *= velocityScale;
      particle.vy *= velocityScale;
    }
  }
  return true;
}
