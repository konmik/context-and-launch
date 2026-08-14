import { Dynamic, type ComponentProps } from "@solidjs/web";
import { omit } from "solid-js";
import {
  ArrowDownToLine as arrowDownToLine, Check as check, ChevronDown as chevronDown,
  ChevronRight as chevronRight, CircleQuestionMark as circleQuestionMark, Copy as copy,
  EllipsisVertical as ellipsisVertical, ExternalLink as externalLink, FileCode2 as fileCode2,
  FileWarning as fileWarning, Folder as folder, FolderOpen as folderOpen,
  GitCompareArrows as gitCompareArrows, GripVertical as gripVertical, Group as group,
  LoaderCircle as loaderCircle, Moon as moon, Network as network, Palette as palette,
  Pause as pause, Play as play, Plus as plus, RefreshCw as refreshCw,
  RotateCcw as rotateCcw, ScrollText as scrollText, Send as send, Settings as settings,
  Sun as sun, Trash2 as trash2, TriangleAlert as triangleAlert, Upload as upload,
  WrapText as wrapText, X as x, Zap as zap,
} from "lucide";

type IconNode = readonly (readonly [string, Record<string, string | number | undefined>])[];
type IconProps = ComponentProps<"svg"> & { size?: number | string; color?: string; strokeWidth?: number | string };

function icon(node: IconNode, name: string) {
  return function Icon(props: IconProps) {
    const rest = omit(props, "size", "color", "strokeWidth", "children");
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={props.size ?? 24}
        height={props.size ?? 24}
        viewBox="0 0 24 24"
        fill="none"
        stroke={props.color ?? "currentColor"}
        stroke-width={props.strokeWidth ?? 2}
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden={props["aria-label"] ? undefined : "true"}
        {...rest}
        class={`lucide lucide-${name}${props.class ? ` ${props.class}` : ""}`}
      >
        {node.map(([element, attributes]) => <Dynamic component={element} {...attributes} />)}
        {props.children}
      </svg>
    );
  };
}

export const ArrowDownToLine = icon(arrowDownToLine, "arrow-down-to-line");
export const Check = icon(check, "check");
export const ChevronDown = icon(chevronDown, "chevron-down");
export const ChevronRight = icon(chevronRight, "chevron-right");
export const CircleQuestionMark = icon(circleQuestionMark, "circle-question-mark");
export const Copy = icon(copy, "copy");
export const EllipsisVertical = icon(ellipsisVertical, "ellipsis-vertical");
export const ExternalLink = icon(externalLink, "external-link");
export const FileCode2 = icon(fileCode2, "file-code-2");
export const FileWarning = icon(fileWarning, "file-warning");
export const Folder = icon(folder, "folder");
export const FolderOpen = icon(folderOpen, "folder-open");
export const GitCompareArrows = icon(gitCompareArrows, "git-compare-arrows");
export const GripVertical = icon(gripVertical, "grip-vertical");
export const Group = icon(group, "group");
export const LoaderCircle = icon(loaderCircle, "loader-circle");
export const Moon = icon(moon, "moon");
export const Network = icon(network, "network");
export const Palette = icon(palette, "palette");
export const Pause = icon(pause, "pause");
export const Play = icon(play, "play");
export const Plus = icon(plus, "plus");
export const RefreshCw = icon(refreshCw, "refresh-cw");
export const RotateCcw = icon(rotateCcw, "rotate-ccw");
export const ScrollText = icon(scrollText, "scroll-text");
export const Send = icon(send, "send");
export const Settings = icon(settings, "settings");
export const Sun = icon(sun, "sun");
export const Trash2 = icon(trash2, "trash-2");
export const TriangleAlert = icon(triangleAlert, "triangle-alert");
export const AlertTriangle = TriangleAlert;
export const Upload = icon(upload, "upload");
export const WrapText = icon(wrapText, "wrap-text");
export const X = icon(x, "x");
export const Zap = icon(zap, "zap");
