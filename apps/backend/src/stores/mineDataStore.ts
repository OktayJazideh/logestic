import * as minesRepo from "../repositories/minesRepository";

export type Mine = minesRepo.MineRow;
export type Village = minesRepo.VillageRow;

export class MineDataStore {
  private mines: Mine[] = [];
  private villages: Village[] = [];

  async hydrate() {
    this.mines = await minesRepo.listMines();
    const allVillages: Village[] = [];
    for (const m of this.mines) {
      allVillages.push(...(await minesRepo.listVillagesByMine(m.id)));
    }
    this.villages = allVillages;
  }

  listMines() {
    return this.mines.slice();
  }

  getMine(mineId: number) {
    return this.mines.find((m) => m.id === mineId) ?? null;
  }

  listVillagesByMine(mineId: number) {
    return this.villages.filter((v) => v.mine_id === mineId);
  }

  async upsertMine(data: Omit<Mine, "id"> & { id?: number }) {
    const mine = await minesRepo.upsertMine(data);
    const idx = this.mines.findIndex((m) => m.id === mine.id);
    if (idx >= 0) this.mines[idx] = mine;
    else this.mines.push(mine);
    return mine;
  }

  async upsertVillage(data: Omit<Village, "id"> & { id?: number }) {
    const village = await minesRepo.upsertVillage(data);
    const idx = this.villages.findIndex((v) => v.id === village.id);
    if (idx >= 0) this.villages[idx] = village;
    else this.villages.push(village);
    return village;
  }
}
