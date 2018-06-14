import React from 'react';

import { NotificationContext } from '../context/NotificationContext';

const MAX_NS_NOTIFICATIONS = 5;

export default class NotificationList extends React.Component {
  static getSeverityClass(severity) {
    switch (severity) {
      case 'danger':
        return 'fa fa-ban';
      case 'warning':
        return 'fa fa-warning';
      case 'info':
        return 'fa fa-circle';
      case 'success':
        return 'fa fa-check';
    }
  }

  constructor(props) {
    super(props);

    this.state = {
      notifications: [],
      storedNotifications: (localStorage.getItem('notifications') || []),
    };

    this.send = this.send.bind(this);
  }

  /*
   * send a message to the notification queue
   * @severity can be one of success|info|warning|danger
   * @opts is an object with up to three entries:
   *   sticky -- Keeps notification visible until cleared if true
   *   linkText -- Text to display as a link if exists
   *   url -- Location the link should point to if exists
   */
  send(message, severity, opts) {
    const { notifications, storedNotifications } = this.state;

    opts = opts || {};
    severity = severity || 'info';

    const notification = { ...opts, message, severity, created: Date.now() };
    notifications.unshift(notification);
    storedNotifications.unshift(notification);
    storedNotifications.splice(40);
    localStorage.setItem('notifications', storedNotifications);

    if (!opts.sticky) {
      if (notifications.length > MAX_NS_NOTIFICATIONS) {
        this.shift(4000);
        return;
      }
      setTimeout(() => this.setState({ notifications: [...notifications] }), 4000);
    }
  }

  /*
   * send a message to the notification queue without displaying the notification box
   * @severity can be one of success|info|warning|danger
   */
  record(message, severity) {
    const { storedNotifications } = this.state;
    const notification = {
      message,
      severity,
      created: Date.now(),
    };

    storedNotifications.unshift(notification);
    localStorage.setItem('notifications', storedNotifications);

    this.setState({ storedNotifications: [...storedNotifications] });
  }

  /*
   * Delete the first non-sticky element from the notifications queue
   */
  shift(delay) {
    const { notifications } = this.state;

    this.remove(notifications.findIndex(n => !n.sticky), delay);
  }

  /*
   * remove an arbitrary element from the notifications queue
   */
  remove(index, delay = 0) {
    const { notifications } = this.state;

    notifications.splice(index, 1);
    this.setTimeout(() => this.setState({ notifications: [...notifications] }), delay);
  }

  /*
   * Clear the list of stored notifications
   */
  clear() {
    const storedNotifications = [];

    localStorage.setItem('notifications', storedNotifications);
    this.setState({ storedNotifications });
  }

  render() {
    const { notifications } = this.state;
    return (
      <NotificationContext.Provider notify={{ send: this.send, food: 'choppin broccoli' }}>
        <ul id="notification-box" className="list-unstyled">
          {notifications.map((notification, idx) => (
            <li>
              <div className={`alert alert-${notification.severity}`}>
                <span
                  className={NotificationList.getSeverityClass(notification.severity)}
                />
                <span>{notification.message}</span>
                {notification.url && notification.linkText && <span>
                  <a href={notification.url}>{notification.linkText}</a>
                </span>}
                {notification.sticky && <button
                  onClick={() => this.remove(idx)}
                  className="close"
                >x</button>}
              </div>
            </li>))}
        </ul>
        {this.props.children}
      </NotificationContext.Provider>
    );
  }
}
