# NotifyHub Frontend Interface

A professional web interface for managing notifications in NotifyHub.

## Features

### 1. **Authentication**
- User registration with email and password
- Login with existing credentials
- Secure JWT-based authentication

### 2. **Send Notifications**
- Send notifications to any user by UUID
- Select notification type (Info, Success, Warning, Error, Reminder, Promotion)
- Add custom title and description
- Choose delivery channels (Email, In-App, or both)
- Add custom JSON metadata
- Quick button to send to yourself for testing

### 3. **View Notifications**
- List all your notifications
- See notification status (delivered, read, pending)
- Visual indicators for notification type
- Filter by read/unread status
- Timestamps for each notification

### 4. **Manage Preferences**
- Enable/disable email notifications
- Enable/disable in-app notifications
- Set quiet hours (start and end time)
- Update email address for notifications

### 5. **Real-time Monitor**
- Connect to WebSocket server
- View incoming notifications in real-time
- See connection status
- Live notification feed with timestamps
- Debug logs for troubleshooting

## Access the Interface

Once your server is running, access the interface at:

```
http://localhost:3000/app/
```

This will show the login/registration page.

## Getting Started

### 1. Register a New Account
- Go to `http://localhost:3000/app/`
- Click "Register" tab
- Enter your name, email, and password (min 8 chars)
- Click "Create Account"

### 2. Send a Test Notification
- After login, you'll see the "Send Notification" section
- Click "Use My ID" to send to yourself
- Select notification type
- Enter title and message
- Check "In-App Notification"
- Click "Send Notification"

### 3. View in Real-time
- Click "Real-time Monitor" in sidebar
- Click "Connect" button
- Open another tab/window and send a notification
- You'll see it appear instantly!

### 4. Configure Preferences
- Click "Preferences" in sidebar
- Toggle email/in-app channels
- Set quiet hours if needed
- Enter your email address for email notifications
- Click "Save Preferences"

## File Structure

```
frontend/
├── index.html      # Login/Registration page
├── dashboard.html  # Main application dashboard
├── styles.css      # Professional styling
├── app.js          # Application logic and API calls
└── README.md       # This file
```

## API Endpoints Used

- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Login
- `POST /api/notify` - Send notification
- `GET /api/notifications/:userId` - Get notifications
- `GET /api/preferences/:userId` - Get preferences
- `PUT /api/preferences/:userId` - Update preferences
- WebSocket `/` - Real-time notifications

## Testing Flow

1. **Register** a user account
2. **Copy your User ID** from the dashboard (shown in top right)
3. **Send a notification** to yourself:
   - Click "Use My ID" button
   - Select type "Info"
   - Title: "Test Notification"
   - Message: "This is a test message"
   - Check "In-App Notification"
   - Click Send
4. **View it live** in the Real-time Monitor section
5. **Check the list** in All Notifications section
6. **Update preferences** to enable/disable channels

## Notes

- The interface uses localStorage to store JWT tokens
- All API calls include the Authorization header
- WebSocket connection uses the same userId
- Real-time monitor shows live connection status
- Form validation prevents invalid submissions

## Troubleshooting

**Can't login?**
- Make sure the server is running on port 3000
- Check browser console for errors
- Verify credentials are correct

**Notifications not appearing?**
- Check if WebSocket is connected (green badge)
- Verify channels are enabled in preferences
- Check user ID is correct

**Network errors?**
- Ensure API server is running: `npm run dev`
- Check CORS is enabled on server
- Verify API_URL in app.js matches your server

## Demo for Others

To demonstrate the system:

1. Open `http://localhost:3000/app/`
2. Register a new account
3. Show the clean dashboard interface
4. Send a notification to yourself
5. Open Real-time Monitor in one tab
6. Send notification from another tab
7. Show it appear instantly in the monitor
8. Show preferences configuration
9. Show notification history

This provides a complete, professional interface for your NotifyHub system!
