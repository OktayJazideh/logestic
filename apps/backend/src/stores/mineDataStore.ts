export type Mine = {
  id: number;
  mine_code: string;
  name: string;
  location_coordinates?: string;
};

export type Village = {
  id: number;
  mine_id: number;
  name: string;
  district?: string;
};

/**
 * DEV/MVP in-memory master data for mines + villages.
 * In the real app this will be backed by PostgreSQL.
 */
export class MineDataStore {
  private mines: Mine[] = [
    { id: 1, mine_code: "MINE-A", name: "معدن آلفا", location_coordinates: "27.0,55.0" },
    { id: 2, mine_code: "MINE-B", name: "معدن بتا", location_coordinates: "28.0,56.0" },
  ];

  private villages: Village[] = [
    { id: 1, mine_id: 1, name: "روستای یک", district: "ناحیه ۱" },
    { id: 2, mine_id: 1, name: "روستای دو", district: "ناحیه ۱" },
    { id: 3, mine_id: 2, name: "روستای سه", district: "ناحیه ۲" },
  ];

  listMines() {
    return this.mines.slice();
  }

  getMine(mineId: number) {
    return this.mines.find((m) => m.id === mineId) ?? null;
  }

  listVillagesByMine(mineId: number) {
    return this.villages.filter((v) => v.mine_id === mineId);
  }
}

