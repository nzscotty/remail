import "./Avatar.scss";
import { avatarColor, initials } from "@/utils/avatar";
type AvatarProps = { name: string; image?: string; small?: boolean };

export function Avatar({ name, image, small = false }: AvatarProps) {
 return <span className={"avatar " + (small ? "avatar-sm" : "")} style={{ background: avatarColor(name) }}>{image ? <img src={image} alt="" /> : initials(name)}</span>;
}
