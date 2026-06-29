import { Fuze } from '../fuzes/fuze.model';
import { Shell } from '../shells/shell.model';

export interface ShellCompatibleFuze {
  id: string;
  shellId: string;
  fuzeId: string;
  shell?: Shell;
  fuze?: Fuze;
}