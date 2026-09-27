import type { JSX, ComponentProps } from '@solidjs/web'
import { Dynamic } from '@solidjs/web'
import { omit } from 'solid-js'

type IconNode = readonly (readonly [string, Record<string, string | number | undefined>])[]

type IconProps = ComponentProps<'svg'> & {
  size?: number | string
  color?: string
  strokeWidth?: number | string
}

export function createIcon(node: IconNode, name: string): (props: IconProps) => JSX.Element {
  return function Icon(props: IconProps): JSX.Element {
    const rest = omit(props, 'size', 'color', 'strokeWidth', 'children')
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={props.size ?? 24}
        height={props.size ?? 24}
        viewBox="0 0 24 24"
        fill="none"
        stroke={props.color ?? 'currentColor'}
        stroke-width={props.strokeWidth ?? 2}
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden={props['aria-label'] ? undefined : 'true'}
        {...rest}
        class={`lucide lucide-${name}${props.class ? ` ${props.class}` : ''}`}
      >
        {node.map(([element, attributes]) => (
          <Dynamic component={element} {...attributes} />
        ))}
        {props.children}
      </svg>
    )
  }
}
