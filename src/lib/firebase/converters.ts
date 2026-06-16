import type {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import type { AppGroup, AppUser, Bet, Suggestion } from "@/types/domain";

export const userConverter: FirestoreDataConverter<AppUser> = {
  toFirestore(user: AppUser): DocumentData {
    const { uid: _uid, ...rest } = user;
    return rest;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot): AppUser {
    return { uid: snapshot.id, ...(snapshot.data() as Omit<AppUser, "uid">) };
  },
};

export const betConverter: FirestoreDataConverter<Bet> = {
  toFirestore(bet: Bet): DocumentData {
    const { id: _id, ...rest } = bet;
    return rest;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot): Bet {
    return { id: snapshot.id, ...(snapshot.data() as Omit<Bet, "id">) };
  },
};

export const groupConverter: FirestoreDataConverter<AppGroup> = {
  toFirestore(g: AppGroup): DocumentData {
    const { id: _id, ...rest } = g;
    return rest;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot): AppGroup {
    return { id: snapshot.id, ...(snapshot.data() as Omit<AppGroup, "id">) };
  },
};

export const suggestionConverter: FirestoreDataConverter<Suggestion> = {
  toFirestore(s: Suggestion): DocumentData {
    const { id: _id, ...rest } = s;
    return rest;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot): Suggestion {
    return { id: snapshot.id, ...(snapshot.data() as Omit<Suggestion, "id">) };
  },
};
