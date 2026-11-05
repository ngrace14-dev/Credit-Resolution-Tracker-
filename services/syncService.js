// services/syncService.js
import { 
    doc, 
    collection, 
    setDoc, 
    getDocs, 
    query, 
    where, 
    writeBatch, 
    serverTimestamp,
    addDoc,
    runTransaction,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/**
 * Acquires a system-wide lock for critical operations (Upload, Rollback, Migration).
 */
export const acquireSystemLock = async (db, lockName, userId, ttlSeconds = 60) => {
    const lockRef = doc(db, "system_locks", lockName);
    
    return await runTransaction(db, async (transaction) => {
        const lockDoc = await transaction.get(lockRef);
        const now = Date.now();

        if (lockDoc.exists()) {
            const data = lockDoc.data();
            const expiry = (data.timestamp?.seconds * 1000 || 0) + (ttlSeconds * 1000);
            if (now < expiry && data.userId !== userId) {
                throw new Error(`CONCURRENT_OPERATION_IN_PROGRESS: ${data.userId} is currently performing this action.`);
            }
        }

        transaction.set(lockRef, {
            userId: userId,
            timestamp: serverTimestamp(),
            ttlSeconds: ttlSeconds
        });
        return true;
    });
};

/**
 * Releases a previously acquired system lock.
 */
export const releaseSystemLock = async (db, lockName) => {
    const lockRef = doc(db, "system_locks", lockName);
    await deleteDoc(lockRef);
};

/**
 * Creates an entry in the upload_manifests collection for audit and rollback.
 */
export const createUploadManifest = async (db, manifestData) => {
    const manifestRef = collection(db, "upload_manifests");
    const docRef = await addDoc(manifestRef, {
        ...manifestData,
        status: 'COMMITTED',
        timestamp: serverTimestamp()
    });
    return docRef.id;
};

/**
 * Atomically rolls back an upload by deleting all associated ledger_events.
 */
export const rollbackUpload = async (db, uploadId, userEmail) => {
    const q = query(collection(db, "ledger_events"), where("upload_id", "==", uploadId));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
        throw new Error("No events found for this upload ID.");
    }

    const batch = writeBatch(db);
    snapshot.docs.forEach(docSnap => {
        batch.delete(docSnap.ref);
    });

    // Update Manifest
    const manifestQ = query(collection(db, "upload_manifests"), where("upload_id", "==", uploadId));
    const manifestSnap = await getDocs(manifestQ);
    manifestSnap.docs.forEach(docSnap => {
        batch.update(docSnap.ref, { status: 'ROLLED_BACK', rolled_back_at: serverTimestamp(), rolled_back_by: userEmail });
    });

    // Log Action
    await addDoc(collection(db, "systemLogs"), {
        timestamp: Date.now(),
        user: userEmail,
        actionType: 'ROLLBACK',
        details: `Rolled back upload ${uploadId} (${snapshot.size} records deleted)`
    });

    await batch.commit();
    return snapshot.size;
};
