import type { MergedLauncherConfig } from '~/core/launcher/launcher-config.js'

export type MergedLauncherItem = MergedLauncherConfig['templates' | 'skills' | 'profiles' | 'shortcuts'][number]

export type MergedTemplate = MergedLauncherConfig['templates'][number]

export type MergedSkill = MergedLauncherConfig['skills'][number]

export type MergedProfile = MergedLauncherConfig['profiles'][number]

export type MergedShortcut = MergedLauncherConfig['shortcuts'][number]
