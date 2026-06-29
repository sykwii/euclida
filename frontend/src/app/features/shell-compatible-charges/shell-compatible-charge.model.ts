import { Charge } from '../charges/charge.model';
import { Shell } from '../shells/shell.model';

export interface ShellCompatibleCharge {
  id: string;
  shellId: string;
  chargeId: string;
  maxRangeM: number;
  shell?: Shell;
  charge?: Charge;
}