import type { MergedLauncherConfig } from '~/core/launcher/launcher-config.js'

export type MergedLauncherItem = MergedLauncherConfig['templates' | 'skills' | 'profiles' | 'shortcuts'][number]

export type MergedSkill = MergedLauncherConfig['skills'][number]
