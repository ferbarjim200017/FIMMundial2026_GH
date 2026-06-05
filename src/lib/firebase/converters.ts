import type {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import type { AppUser, Bet } from "@/types/domain";

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
