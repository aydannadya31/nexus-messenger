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
}

export interface Chat {
  id: string;
  participants: string[];
  type: 'private' | 'group';
  groupMetadata?: {
    name: string;
    photoURL?: string;
    createdBy: string;
  };
  lastMessage?: {
    text: string;
    senderId: string;
    senderName?: string;
    timestamp: any;
  };
  updatedAt: any;
}

export interface Message {
  id: string;
  text?: string;
  senderId: string;
  timestamp: any;
  type: 'text' | 'image' | 'video' | 'audio';
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  reactions?: Record<string, string>; // userId -> emoji
  isDeleted?: boolean;
  deletedAt?: any;
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
