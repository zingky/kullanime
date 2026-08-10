export type UserRole = "admin" | "user";

export type AnimeStatus = "Watching" | "Completed" | "Plan to Watch" | "Dropped";

export type SongType = "OP" | "ED" | "Insert";

export interface ThemeSong {
  type: SongType;
  title: string;
  artist: string;
  episodes?: string;
}

export interface CharactersStaff {
  characters?: {
    id: number;
    name: string;
    role: string;
    image?: string;
    voice_actors?: Array<{
      id: number;
      name: string;
      language: string;
    }>;
  }[];
  staff?: {
    id: number;
    name: string;
    role: string;
  }[];
}

export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  role: UserRole;
  is_private: boolean;
  created_at: string;
}

export interface Anime {
  id: string;
  mal_id: number | null;
  title: string;
  title_japanese: string | null;
  cover_image: string | null;
  studio: string | null;
  characters_staff: CharactersStaff | null;
  youtube_trailer_id: string | null;
  homepage_url: string | null;
  mal_url: string | null;
  theme_songs: ThemeSong[] | null;
  created_by: string;
  created_at: string;
}

export interface AnimeWithUser extends Anime {
  user_anime_list: UserAnimeListEntry[] | null;
  profiles?: Profile;
}

export interface UserAnimeListEntry {
  id: string;
  user_id: string;
  anime_id: string;
  status: AnimeStatus;
  rating: number | null;
  review_text: string | null;
  personal_photos: string[] | null;
  created_at: string;
  created_by?: string;
  anime?: AnimeWithUser;
  profiles?: Profile;
}

export interface Comment {
  id: string;
  anime_id: string;
  user_id: string | null;
  guest_name: string | null;
  content: string;
  is_anonymous: boolean;
  created_at: string;
  profiles?: Profile;
}

export interface BadWord {
  id: string;
  word: string;
}

export interface JikanAnimeSearchResult {
  mal_id: number;
  title: string;
  title_japanese: string;
  images: {
    jpg: {
      image_url: string;
      large_image_url: string;
    };
  };
  studios: Array<{ mal_id: number; name: string }>;
  trailer: {
    youtube_id: string | null;
  } | null;
  url: string;
}

export interface JikanAnimeFull {
  mal_id: number;
  title: string;
  title_japanese: string;
  images: {
    jpg: {
      image_url: string;
      large_image_url: string;
    };
  };
  trailer: {
    youtube_id: string | null;
  } | null;
  url: string;
  homepage: string | null;
  studios: Array<{ mal_id: number; name: string }>;
  characters_staff?: {
    data?: Array<{
      character: {
        mal_id: number;
        name: string;
        images: {
          jpg: { image_url: string };
        };
      };
      role: string;
      voice_actors: Array<{
        person: {
          mal_id: number;
          name: string;
        };
        language: string;
      }>;
    }>;
  };
}

export interface JikanTheme {
  opening: string[];
  ending: string[];
}