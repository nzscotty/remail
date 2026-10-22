

const avatarColors = ["#e8ddff", "#dceeff", "#ffe3d4", "#d8f3e5"];
export function avatarColor(name: string) { return avatarColors[name.length % avatarColors.length]; }
export function initials(name: string) { return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
