import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('shells')
export class Shell {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'system_type', length: 50 })
  systemType: string;

  @Column({ name: 'damage_type', length: 100 })
  damageType: string;

  @Column({ length: 100, unique: true })
  marking: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}