/**
 * Helper client service to send automated emails via /api/send-email (Resend API)
 */

export interface SendEmailOptions {
  to: string;
  recipientName: string;
  subject: string;
  type: 'property_listing' | 'rental_request' | 'viewing_schedule' | 'account_update' | 'alert_subscription';
  data: Record<string, any>;
}

export async function sendEmailViaResend(options: SendEmailOptions): Promise<{ success: boolean; simulated?: boolean; message?: string }> {
  const html = buildEmailHtml(options);

  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: options.to,
        subject: options.subject,
        html,
        type: options.type,
      }),
    });

    if (!response.ok) {
      console.warn('Failed to send email endpoint:', response.statusText);
      return { success: false, simulated: true, message: 'Server endpoint returned non-200' };
    }

    const resData = await response.json();
    return resData;
  } catch (err) {
    console.error('Error invoking /api/send-email:', err);
    return { success: false, simulated: true, message: 'Fetch network exception' };
  }
}

function buildEmailHtml(options: SendEmailOptions): string {
  const { recipientName, type, data } = options;

  let contentHtml = '';

  switch (type) {
    case 'property_listing':
      contentHtml = `
        <div style="background-color: #1E222A; border: 1px solid #08D9D6; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <h2 style="color: #08D9D6; margin-top: 0; font-size: 20px;">Property Submitted for Verification</h2>
          <p style="color: #E2E8F0; font-size: 15px; line-height: 1.6;">Hello <strong>${recipientName}</strong>,</p>
          <p style="color: #CBD5E1; font-size: 14px; line-height: 1.6;">
            Your property listing <strong>"${data.propertyTitle}"</strong> has been successfully submitted to Goodlucks Homes.
          </p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px; background: #252A34; border-radius: 8px; overflow: hidden;">
            <tr>
              <td style="padding: 10px 14px; color: #94A3B8; font-size: 13px;">Location:</td>
              <td style="padding: 10px 14px; color: #FFFFFF; font-weight: bold; font-size: 13px;">${data.location}</td>
            </tr>
            <tr style="border-top: 1px solid #333A48;">
              <td style="padding: 10px 14px; color: #94A3B8; font-size: 13px;">Monthly Rent:</td>
              <td style="padding: 10px 14px; color: #08D9D6; font-weight: bold; font-size: 13px;">GH₵ ${Number(data.rentGhs).toLocaleString()}</td>
            </tr>
            <tr style="border-top: 1px solid #333A48;">
              <td style="padding: 10px 14px; color: #94A3B8; font-size: 13px;">Status:</td>
              <td style="padding: 10px 14px; color: #F59E0B; font-weight: bold; font-size: 13px;">Pending Intermediary Verification</td>
            </tr>
          </table>
          <p style="color: #94A3B8; font-size: 13px; margin-top: 15px;">
            Our verified team will review physical documentation and conduct preliminary checks before publishing to tenants.
          </p>
        </div>
      `;
      break;

    case 'rental_request':
      contentHtml = `
        <div style="background-color: #1E222A; border: 1px solid #08D9D6; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <h2 style="color: #08D9D6; margin-top: 0; font-size: 20px;">Property Matching Request Received</h2>
          <p style="color: #E2E8F0; font-size: 15px; line-height: 1.6;">Hello <strong>${recipientName}</strong>,</p>
          <p style="color: #CBD5E1; font-size: 14px; line-height: 1.6;">
            We have received your home search preferences. Goodlucks Homes AI matching engine and verified agents are matching properties to your request!
          </p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px; background: #252A34; border-radius: 8px; overflow: hidden;">
            <tr>
              <td style="padding: 10px 14px; color: #94A3B8; font-size: 13px;">Preferred Regions:</td>
              <td style="padding: 10px 14px; color: #FFFFFF; font-weight: bold; font-size: 13px;">${data.locations}</td>
            </tr>
            <tr style="border-top: 1px solid #333A48;">
              <td style="padding: 10px 14px; color: #94A3B8; font-size: 13px;">Budget Range:</td>
              <td style="padding: 10px 14px; color: #08D9D6; font-weight: bold; font-size: 13px;">GH₵ ${Number(data.budgetMin).toLocaleString()} - GH₵ ${Number(data.budgetMax).toLocaleString()} / mo</td>
            </tr>
            <tr style="border-top: 1px solid #333A48;">
              <td style="padding: 10px 14px; color: #94A3B8; font-size: 13px;">Bedrooms:</td>
              <td style="padding: 10px 14px; color: #FFFFFF; font-weight: bold; font-size: 13px;">${data.bedrooms} Bed (${data.propertyType})</td>
            </tr>
          </table>
          <p style="color: #94A3B8; font-size: 13px; margin-top: 15px;">
            You will receive direct updates on your Tenant Dashboard as soon as matches are confirmed.
          </p>
        </div>
      `;
      break;

    case 'viewing_schedule':
      contentHtml = `
        <div style="background-color: #1E222A; border: 1px solid #08D9D6; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <h2 style="color: #08D9D6; margin-top: 0; font-size: 20px;">Viewing Schedule Request Confirmed</h2>
          <p style="color: #E2E8F0; font-size: 15px; line-height: 1.6;">Hello <strong>${recipientName}</strong>,</p>
          <p style="color: #CBD5E1; font-size: 14px; line-height: 1.6;">
            A physical viewing session has been requested for <strong>"${data.propertyTitle}"</strong>.
          </p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px; background: #252A34; border-radius: 8px; overflow: hidden;">
            <tr>
              <td style="padding: 10px 14px; color: #94A3B8; font-size: 13px;">Scheduled Date & Time:</td>
              <td style="padding: 10px 14px; color: #08D9D6; font-weight: bold; font-size: 13px;">${data.date} at ${data.time}</td>
            </tr>
            <tr style="border-top: 1px solid #333A48;">
              <td style="padding: 10px 14px; color: #94A3B8; font-size: 13px;">Location:</td>
              <td style="padding: 10px 14px; color: #FFFFFF; font-weight: bold; font-size: 13px;">${data.location}</td>
            </tr>
            <tr style="border-top: 1px solid #333A48;">
              <td style="padding: 10px 14px; color: #94A3B8; font-size: 13px;">Assigned Intermediary:</td>
              <td style="padding: 10px 14px; color: #FFFFFF; font-weight: bold; font-size: 13px;">Goodlucks Officer (+233 24 123 4567)</td>
            </tr>
          </table>
          <p style="color: #94A3B8; font-size: 13px; margin-top: 15px;">
            Please arrive at the property location 10 minutes prior to your scheduled time.
          </p>
        </div>
      `;
      break;

    case 'account_update':
      contentHtml = `
        <div style="background-color: #1E222A; border: 1px solid #08D9D6; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <h2 style="color: #08D9D6; margin-top: 0; font-size: 20px;">Account Details Updated</h2>
          <p style="color: #E2E8F0; font-size: 15px; line-height: 1.6;">Hello <strong>${recipientName}</strong>,</p>
          <p style="color: #CBD5E1; font-size: 14px; line-height: 1.6;">
            Your Goodlucks Homes profile information has been successfully updated on <strong>${new Date().toLocaleDateString()}</strong>.
          </p>
          <p style="color: #94A3B8; font-size: 13px; margin-top: 15px;">
            If you did not initiate this change, please contact Goodlucks support immediately.
          </p>
        </div>
      `;
      break;

    case 'alert_subscription':
      contentHtml = `
        <div style="background-color: #1E222A; border: 1px solid #08D9D6; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <h2 style="color: #08D9D6; margin-top: 0; font-size: 20px;">🔔 Search Alert Subscription Activated!</h2>
          <p style="color: #E2E8F0; font-size: 15px; line-height: 1.6;">Hello <strong>${recipientName}</strong>,</p>
          <p style="color: #CBD5E1; font-size: 14px; line-height: 1.6;">
            You have successfully subscribed to automated property alerts on Goodlucks Homes. As soon as a new listing matching your criteria is verified, you will be notified!
          </p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px; background: #252A34; border-radius: 8px; overflow: hidden;">
            <tr>
              <td style="padding: 10px 14px; color: #94A3B8; font-size: 13px;">Location Filter:</td>
              <td style="padding: 10px 14px; color: #FFFFFF; font-weight: bold; font-size: 13px;">${data.location || 'All Suburbs'}</td>
            </tr>
            <tr style="border-top: 1px solid #333A48;">
              <td style="padding: 10px 14px; color: #94A3B8; font-size: 13px;">Property Type:</td>
              <td style="padding: 10px 14px; color: #FFFFFF; font-weight: bold; font-size: 13px;">${data.propertyType || 'All Types'}</td>
            </tr>
            <tr style="border-top: 1px solid #333A48;">
              <td style="padding: 10px 14px; color: #94A3B8; font-size: 13px;">Max Rent Budget:</td>
              <td style="padding: 10px 14px; color: #08D9D6; font-weight: bold; font-size: 13px;">Up to GH₵ ${Number(data.maxRentGhs).toLocaleString()}/mo</td>
            </tr>
            <tr style="border-top: 1px solid #333A48;">
              <td style="padding: 10px 14px; color: #94A3B8; font-size: 13px;">Bedrooms:</td>
              <td style="padding: 10px 14px; color: #FFFFFF; font-weight: bold; font-size: 13px;">${data.bedrooms === 'All' ? 'Any Bedrooms' : `${data.bedrooms} Bed`}</td>
            </tr>
            <tr style="border-top: 1px solid #333A48;">
              <td style="padding: 10px 14px; color: #94A3B8; font-size: 13px;">Alert Frequency:</td>
              <td style="padding: 10px 14px; color: #08D9D6; font-weight: bold; font-size: 13px;">${data.frequency ? data.frequency.toUpperCase() : 'INSTANT'}</td>
            </tr>
          </table>
          <p style="color: #94A3B8; font-size: 13px; margin-top: 15px;">
            Goodlucks Homes verifies every listing physically before publishing. You can manage or pause your alert notifications anytime from your tenant dashboard.
          </p>
        </div>
      `;
      break;
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${options.subject}</title>
      </head>
      <body style="background-color: #252A34; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 24px; color: #FFFFFF;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #1A1D24; border-radius: 16px; border: 1px solid #2E3542; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <!-- Header -->
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #2E3542; padding-bottom: 16px; margin-bottom: 20px;">
            <div style="font-size: 22px; font-weight: 900; color: #FFFFFF; letter-spacing: -0.5px;">
              Goodlucks<span style="color: #08D9D6;">Homes</span>
            </div>
            <span style="font-size: 11px; font-weight: bold; background: rgba(8, 217, 214, 0.15); color: #08D9D6; padding: 4px 10px; border-radius: 20px; border: 1px solid rgba(8, 217, 214, 0.3);">
              VERIFIED INTERMEDIARY
            </span>
          </div>

          <!-- Dynamic Body Content -->
          ${contentHtml}

          <!-- Footer -->
          <div style="border-top: 1px solid #2E3542; padding-top: 16px; margin-top: 24px; text-align: center; color: #64748B; font-size: 12px;">
            <p style="margin: 0 0 6px 0; font-weight: bold; color: #94A3B8;">Goodlucks Homes Intermediary Services Ltd.</p>
            <p style="margin: 0 0 6px 0;">East Legon & Spintex Road, Accra - Ghana | +233 23 769 0080</p>
            <p style="margin: 0; font-size: 11px; color: #475569;">You received this automated notification for actions performed on your Goodlucks Homes account.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}
