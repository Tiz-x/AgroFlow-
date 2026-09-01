import { useState } from "react";
import { RiChatCheckLine, RiShoppingBagLine, RiTimeLine } from "react-icons/ri";
import { MdCheckCircle, MdCancel } from "react-icons/md";
import { timeAgo } from "../constants";
import { LoadingButton } from "../../../components/LoadingButton/LoadingButton";
import styles from "../BuyerSellerDashboard.module.css";
import type { Request } from "../../../services/marketService";

interface SectionRequestsProps {
  requests: Request[];
  onAccept: (r: Request) => Promise<void>;
  onReject: (r: Request) => Promise<void>;
}

export function SectionRequests({ requests, onAccept, onReject }: SectionRequestsProps) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'accept' | 'reject' | null>(null);

  const handleAccept = async (req: Request) => {
    setProcessingId(req.id);
    setActionType('accept');
    try {
      await onAccept(req);
    } finally {
      setProcessingId(null);
      setActionType(null);
    }
  };

  const handleReject = async (req: Request) => {
    setProcessingId(req.id);
    setActionType('reject');
    try {
      await onReject(req);
    } finally {
      setProcessingId(null);
      setActionType(null);
    }
  };

  if (requests.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>
          <RiChatCheckLine size={48} />
        </div>
        <div className={styles.emptyTitle}>No requests yet</div>
        <div className={styles.emptyText}>
          When buyers request your produce, they'll appear here.
        </div>
      </div>
    );
  }

  // Sort requests: pending first, then by createdAt descending
  const sortedRequests = [...requests].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className={styles.requestsList}>
      {sortedRequests.map((req) => {
        const isProcessing = processingId === req.id;
        const isLoadingAccept = isProcessing && actionType === 'accept';
        const isLoadingReject = isProcessing && actionType === 'reject';
        
        return (
          <div key={req.id} className={styles.requestCard}>
            <div className={styles.requestHeader}>
              <div className={styles.requestBuyer}>{req.buyerName}</div>
              <div
                className={`${styles.requestStatus} ${
                  req.status === "pending"
                    ? styles.statusPending
                    : req.status === "accepted"
                    ? styles.statusAccepted
                    : req.status === "rejected"
                    ? styles.statusRejected
                    : styles.statusCompleted
                }`}
              >
                {req.status === "pending" && "Pending"}
                {req.status === "accepted" && "Accepted"}
                {req.status === "rejected" && "Declined"}
                {req.status === "completed" && "Completed"}
              </div>
            </div>
            <div className={styles.requestDetails}>
              <div>
                <RiShoppingBagLine size={12} /> {req.requestedQty}kg
              </div>
              <div>
                <RiTimeLine size={12} /> {timeAgo(req.createdAt)}
              </div>
            </div>
            {req.message && (
              <div className={styles.requestMessage}>
                <RiChatCheckLine size={12} /> "{req.message}"
              </div>
            )}
            {req.status === "pending" && (
              <div className={styles.requestActions}>
                <LoadingButton
                  loading={isLoadingAccept}
                  className={styles.acceptBtn}
                  onClick={() => handleAccept(req)}
                  disabled={isProcessing}
                >
                  <MdCheckCircle size={16} /> {isLoadingAccept ? 'Accepting...' : 'Accept'}
                </LoadingButton>
                <LoadingButton
                  loading={isLoadingReject}
                  className={styles.rejectBtn}
                  onClick={() => handleReject(req)}
                  disabled={isProcessing}
                >
                  <MdCancel size={16} /> {isLoadingReject ? 'Declining...' : 'Decline'}
                </LoadingButton>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}