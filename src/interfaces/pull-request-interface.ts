import { Label } from './label-interface'

export interface PullRequest {
  id: number
  title: string
  labels: Label[]
}
