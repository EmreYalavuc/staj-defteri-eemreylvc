export interface DiaryEntry {
  id: string;
  gun: number;
  tarih: string;
  createdAt: string;
  amac: string;
  yapilan: string[];
  teknolojiler: string[];
  kazanimlar: string[];
  problemler?: string[];
  cozumler?: string[];
  imageUrls?: string[];
}
