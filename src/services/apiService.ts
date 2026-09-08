/**
 * Goodlucks Homes - Client API Service Layer
 * 
 * Communicates with the cPanel PHP / MySQL backend (/api/*).
 * Automatically falls back gracefully if backend is offline.
 */

import { Property, PriceDropAlert } from '../types';

/**
 * Fetch properties from PHP / MySQL backend
 */
export async function fetchPropertiesFromApi(): Promise<Property[] | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch('/api/properties', {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      // Try direct .php endpoint if rewrite is not enabled
      const phpResponse = await fetch('/api/properties.php');
      if (!phpResponse.ok) return null;
      const data = await phpResponse.json();
      return data.properties || null;
    }

    const data = await response.json();
    return data.properties || null;
  } catch {
    return null;
  }
}

/**
 * Submit Price Drop Alert to PHP / MySQL backend
 */
export async function submitPriceDropAlertToApi(alert: PriceDropAlert): Promise<{ success: boolean; alertId?: string }> {
  try {
    const payload = {
      propertyId: alert.propertyId,
      propertyTitle: alert.propertyTitle,
      propertyLocation: alert.propertyLocation,
      currentRentGhs: alert.currentRentGhs,
      targetRentGhs: alert.targetRentGhs,
      email: alert.email,
      name: alert.name,
      notifyOnAnyDrop: alert.notifyOnAnyDrop ? 1 : 0
    };

    let response = await fetch('/api/price-alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => null);

    if (!response || !response.ok) {
      response = await fetch('/api/price_alerts.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => null);
    }

    if (response && response.ok) {
      const data = await response.json();
      return { success: true, alertId: data.alertId };
    }
    return { success: false };
  } catch {
    return { success: false };
  }
}

/**
 * Submit Viewing Request to PHP / MySQL backend
 */
export async function submitViewingRequestToApi(viewingData: {
  tenantName: string;
  tenantPhone: string;
  tenantEmail?: string;
  propertyId: string;
  propertyTitle: string;
  propertyLocation: string;
  date: string;
  time: string;
  notes?: string;
}): Promise<{ success: boolean; viewingId?: string }> {
  try {
    let response = await fetch('/api/viewing-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(viewingData)
    }).catch(() => null);

    if (!response || !response.ok) {
      response = await fetch('/api/viewing_request.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(viewingData)
      }).catch(() => null);
    }

    if (response && response.ok) {
      const data = await response.json();
      return { success: true, viewingId: data.viewingId };
    }
    return { success: false };
  } catch {
    return { success: false };
  }
}
