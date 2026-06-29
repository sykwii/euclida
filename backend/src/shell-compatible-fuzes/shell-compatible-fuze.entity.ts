import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Fuze } from '../fuzes/fuze.entity';
import { Shell } from '../shells/shell.entity';

@Entity('shell_compatible_fuzes')
export class ShellCompatibleFuze {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'shell_id', type: 'uuid' })
  shellId!: string;

  @ManyToOne(() => Shell, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shell_id' })
  shell!: Shell;

  @Column({ name: 'fuze_id', type: 'uuid' })
  fuzeId!: string;

  @ManyToOne(() => Fuze, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fuze_id' })
  fuze!: Fuze;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}