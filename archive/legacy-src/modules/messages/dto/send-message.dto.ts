export interface SendMessageDto {
  recipientId: string;
  projectId?: string;
  content: string;
  attachments?: Record<string, any>;
}