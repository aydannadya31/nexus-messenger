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
  nickname?: string;
  bannedUntil?: any;
  role?: 'user' | 'admin';
  country?: string;
  profileCompleted?: boolean;
  birthDate?: string;
  phone?: string;
  location?: string;
  showBirthDate?: boolean;
  showPhone?: boolean;
  showLocation?: boolean;
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
    password?: string;
    bannedUsers?: { userId: string; until?: any }[];
  };
  lastMessage?: {
    text: string;
    senderId: string;
    senderName?: string;
    timestamp: any;
  };
  updatedAt: any;
  muted?: boolean;
  unreadCount?: number;
  heldBy?: string;
  holdExpiresAt?: any;
  holdDailyCount?: number;
  holdDate?: string;
  heldMembers?: Record<string, { heldBy: string; expiresAt?: any }>;
  groupCountry?: string;
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
  reactions?: Record<string, string>;
  deletedBy?: string[];
  toAdmin?: boolean;
  callDuration?: number;
  callStatus?: 'missed' | 'completed' | 'cancelled' | 'rejected' | 'answered';
  encrypted?: boolean;
  imagePassword?: string;
}

export interface Call {
  id: string;
  participants: string[];
  activeParticipants: string[];
  chatId: string;
  callerId: string;
  type: 'private' | 'group';
  mediaType: 'audio' | 'video';
  status: 'calling' | 'ongoing' | 'ended';
  createdAt: any;
  engine?: 'livekit' | 'daily' | 'websocket';
  roomId?: string;
}

export interface CallSignal {
  id: string;
  from: string;
  to: string;
  type: 'offer' | 'answer' | 'candidate';
  data: any;
  createdAt: any;
}
