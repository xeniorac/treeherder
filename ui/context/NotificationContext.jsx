import React from 'react';

export const NotificationContext = React.createContext({
  send: () => console.log('do notify'),
  food: 'crust',
});

export function withNotifications(Component) {
  return function NotificationComponent(props) {
    return (
      <NotificationContext.Consumer>
        {notify => <Component {...props} notify={notify} />}
      </NotificationContext.Consumer>
    );
  };
}
