import { Label } from './label-interface.js'

export interface PullRequest {
  id: number
  title: string
  labels: Label[]
}
