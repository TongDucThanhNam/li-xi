export function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
}

export function isRawIpv4Hostname(hostname: string) {
  return /^\d+(?:\.\d+){3}$/.test(normalizeHostname(hostname));
}

export function isRawIpv6Hostname(hostname: string) {
  return normalizeHostname(hostname).includes(":");
}

export function isRawIpHostname(hostname: string) {
  return isRawIpv4Hostname(hostname) || isRawIpv6Hostname(hostname);
}

export function isLocalOrPrivateHostname(hostname: string) {
  const normalizedHostname = normalizeHostname(hostname);
  if (
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost") ||
    normalizedHostname.endsWith(".local")
  ) {
    return true;
  }

  if (
    normalizedHostname === "::" ||
    normalizedHostname === "::1" ||
    normalizedHostname.startsWith("fc") ||
    normalizedHostname.startsWith("fd") ||
    normalizedHostname.startsWith("fe80:")
  ) {
    return true;
  }

  const mappedIpv4 = normalizedHostname.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (normalizedHostname.startsWith("::ffff:") && !mappedIpv4) {
    return true;
  }
  const ipv4Hostname = mappedIpv4?.[1] ?? normalizedHostname;

  const ipv4Match = ipv4Hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) {
    return false;
  }

  const octets = ipv4Match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) {
    return true;
  }

  const [first, second, third] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    first === 169 && second === 254 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}
