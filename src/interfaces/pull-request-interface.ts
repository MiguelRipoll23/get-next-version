import { Label } from "./label-interface";

export interface PullRequest {
  id: number;
  draft?: boolean | undefined;
  title: string;
  labels: Label[];
}
