const RAD = Math.PI / 180;

// NASA GISS Mars24, sections D-1 and D-5/D-6. Use a spherical Mars
// to match the map frame. LTST already accounts for longitude and the equation of time.
// https://www.giss.nasa.gov/tools/mars24/help/algorithm.html
export function marsSunDirection({ latitudeDeg, solarLongitudeDeg, trueSolarHour }) {
  const latitude = latitudeDeg * RAD;
  const season = Math.sin(solarLongitudeDeg * RAD);
  // Mars24 D-1 includes a small empirical seasonal correction in addition
  // to the arcsine term. Keep it in degrees before converting to radians.
  const declination = Math.asin(0.42565 * season) + 0.25 * season * RAD;
  const hourAngle = (trueSolarHour - 12) * 15 * RAD;
  const cosDeclination = Math.cos(declination);
  const meridian = cosDeclination * Math.cos(hourAngle);
  const sinDeclination = Math.sin(declination);

  return [
    -cosDeclination * Math.sin(hourAngle), // East
    Math.cos(latitude) * sinDeclination - Math.sin(latitude) * meridian, // North
    Math.sin(latitude) * sinDeclination + Math.cos(latitude) * meridian, // Up
  ];
}
