export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  lastSeen?: any;
  status?: string;
  about?: string;
  uin?: string;
  onlineStatus?: 'online' | 'away' | 'busy';
  profileCompleted?: boolean;
  nickname?: string;
  country?: string;
  birthDate?: string;
  phone?: string;
  location?: string;
  showBirthDate?: boolean;
  showPhone?: boolean;
  showLocation?: boolean;
  bannedUntil?: any;
}

export interface Chat {
  id: string;
  participants: string[];
  type: 'private' | 'group';
  groupMetadata?: {
    name: string;
    photoURL?: string;
    createdBy: string;
    adminId?: string;
    adminHistory?: string[];
    bannedUsers?: Array<{
      uid: string;
      displayName: string;
      bannedUntil?: any;
      bannedAt?: any;
      bannedBy?: string;
    }>;
    password?: string;
  };
  lastMessage?: {
    text: string;
    senderId: string;
    senderName?: string;
    timestamp: any;
  };
  updatedAt: any;
  heldBy?: string | null;
  holdExpiresAt?: any;
  groupCountry?: string;
  muted?: boolean;
}

export interface Message {
  id: string;
  text?: string;
  senderId: string;
  timestamp: any;
  type: 'text' | 'image' | 'video' | 'audio' | 'call';
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  reactions?: Record<string, string>; // userId -> emoji
  isDeleted?: boolean;
  deletedAt?: any;
  encrypted?: boolean;
  imagePassword?: string;
  callType?: 'audio' | 'video';
  callDuration?: number;
  callStatus?: 'missed' | 'completed' | 'rejected';
  callerId?: string;
  blockedByAdmin?: boolean;
  deletedBy?: string[];
  replyTo?: { id: string; text?: string; senderId: string };
  edited?: boolean;
  editedAt?: any;
  viewOnce?: boolean;
  viewOnceOpened?: boolean;
}

export interface Call {
  id: string;
  participants: string[];
  activeParticipants: string[];
  chatId: string;
  callerId: string;
  type: 'private' | 'group';
  status: 'calling' | 'ongoing' | 'ended';
  mediaType: 'audio' | 'video';
  createdAt: any;
}

export interface CallSignal {
  id: string;
  from: string;
  to: string;
  type: 'offer' | 'answer' | 'candidate';
  data: any;
  createdAt: any;
}
